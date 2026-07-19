from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, user_permissions
from app.core.security import create_token, decode_token, enforce_password_policy, hash_password, verify_password_timing_safe, verify_totp
from app.db.models import RefreshSession, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.cache import (
    blacklist_token,
    clear_failed_logins,
    increment_window,
    is_account_locked,
    mark_totp_used,
    record_failed_login,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    mfa_code: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class MeResponse(BaseModel):
    identification: str
    name: str
    email: str
    roles: list[str]
    permissions: list[str]
    password_change_required: bool = False


class SessionStatusResponse(BaseModel):
    authenticated: bool
    user: MeResponse | None = None


def _role_names(user: User) -> list[str]:
    return [item.role.role_name for item in user.roles]


def _me_response(user: User, db: Session) -> MeResponse:
    return MeResponse(
        identification=user.identification,
        name=user.name,
        email=user.email,
        roles=_role_names(user),
        permissions=sorted(user_permissions(db, user)),
        password_change_required=bool(user.password_change_required),
    )


def _is_expired(value: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value < datetime.now(UTC)


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    cookie_options = {
        "httponly": True,
        "secure": settings.is_production,
        "samesite": "strict",
        "path": "/",
    }
    response.set_cookie(
        "ambar_access_token",
        access_token,
        max_age=settings.access_token_expire_minutes * 60,
        **cookie_options,
    )
    response.set_cookie(
        "ambar_refresh_token",
        refresh_token,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
        **cookie_options,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("ambar_access_token", path="/")
    response.delete_cookie("ambar_refresh_token", path="/")


def _optional_current_user(request: Request, db: Session) -> User | None:
    token = request.cookies.get("ambar_access_token")
    authorization = request.headers.get("authorization", "")
    if not token and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        payload = decode_token(token)
    except ValueError:
        return None
    if payload.get("type") != "access":
        return None
    user = db.get(User, payload.get("sub"))
    if not user or user.status != "active":
        return None
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    ip = request.client.host if request.client else "unknown"

    # Verificar lockout antes de consultar la BD (previene enumeración por timing)
    if is_account_locked(payload.email) or is_account_locked(ip):
        write_audit(
            db,
            action="login_failed",
            event="failed_login",
            module="auth",
            new_values={"email": payload.email, "reason": "account_locked"},
            result="failed",
            severity="critical",
            tags=["security", "lockout"],
            request=request,
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account temporarily locked due to multiple failed login attempts",
            headers={"Retry-After": "900"},
        )

    user = db.query(User).filter(User.email == payload.email).one_or_none()

    # verify_password_timing_safe siempre ejecuta bcrypt aunque user sea None
    password_ok = verify_password_timing_safe(payload.password, user.password_hash if user else None)

    if not user or not password_ok or user.status != "active":
        attempts = record_failed_login(payload.email)
        record_failed_login(ip)
        write_audit(
            db,
            action="login_failed",
            event="failed_login",
            module="auth",
            user_id=user.identification if user else None,
            new_values={"email": payload.email, "attempts": attempts},
            result="failed",
            severity="warning",
            tags=["security", "authentication"],
            request=request,
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.mfa_enabled:
        if not user.mfa_secret:
            write_audit(db, action="login_failed_mfa_not_configured", event="failed_login", module="auth", user_id=user.identification, result="failed", severity="warning", tags=["mfa"], request=request)
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MFA is enabled but not configured")
        if not payload.mfa_code:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MFA code required")
        if not verify_totp(user.mfa_secret, payload.mfa_code):
            record_failed_login(user.identification)
            write_audit(db, action="login_failed_mfa", event="failed_login", module="auth", user_id=user.identification, result="failed", severity="warning", tags=["mfa", "security"], request=request)
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid MFA code")
        # Protección anti-replay de TOTP
        if not mark_totp_used(user.identification, payload.mfa_code):
            write_audit(db, action="login_failed_totp_replay", event="failed_login", module="auth", user_id=user.identification, result="failed", severity="critical", tags=["mfa", "replay"], request=request)
            db.commit()
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="MFA code already used")

    # Login exitoso — limpiar contadores
    clear_failed_logins(payload.email)
    clear_failed_logins(ip)

    permissions = sorted(user_permissions(db, user))
    roles = _role_names(user)
    settings = get_settings()
    access_token = create_token(
        user.identification,
        "access",
        minutes=settings.access_token_expire_minutes,
        roles=roles,
        permissions=permissions,
        company_id=user.company_id,
        location_id=user.location_id,
    )
    refresh_token = create_token(
        user.identification,
        "refresh",
        days=settings.refresh_token_expire_days,
        roles=roles,
    )
    refresh_payload = decode_token(refresh_token)
    db.add(
        RefreshSession(
            ps405Identification=user.identification,
            refresh_jti=refresh_payload["jti"],
            user_agent=request.headers.get("user-agent"),
            ip_address=request.client.host if request.client else None,
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    write_audit(
        db,
        action="login_success",
        event="login",
        module="auth",
        user_id=user.identification,
        auditable_type="User",
        auditable_id=user.identification,
        tags=["authentication"],
        request=request,
    )
    db.commit()
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/password/change")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Las claves no coinciden")
    if not verify_password_timing_safe(payload.current_password, user.password_hash):
        write_audit(
            db,
            action="password_change_failed",
            event="permission_change",
            module="auth",
            user_id=user.identification,
            auditable_type="User",
            auditable_id=user.identification,
            result="failed",
            severity="warning",
            tags=["authentication", "password"],
            request=request,
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="La clave actual no es correcta")
    try:
        enforce_password_policy(payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if verify_password_timing_safe(payload.new_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La nueva clave debe ser diferente")

    old_values = {"password_change_required": bool(user.password_change_required)}
    user.password_hash = hash_password(payload.new_password)
    user.password_change_required = False
    write_audit(
        db,
        action="password_changed",
        event="permission_change",
        module="auth",
        user_id=user.identification,
        auditable_type="User",
        auditable_id=user.identification,
        old_values=old_values,
        new_values={"password_change_required": False},
        severity="critical",
        tags=["authentication", "password"],
        request=request,
    )
    db.commit()
    return {"ok": True, "message": "Clave actualizada. Ya puedes continuar en AMBAR."}


@router.post("/password/forgot")
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)) -> dict:
    ip = request.client.host if request.client else "unknown"
    reset_window_seconds = 900
    email_attempts = increment_window(f"password_reset_email:{payload.email}", reset_window_seconds)
    ip_attempts = increment_window(f"password_reset_ip:{ip}", reset_window_seconds)
    if (email_attempts and email_attempts > 3) or (ip_attempts and ip_attempts > 20):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Intenta nuevamente en unos minutos.",
            headers={"Retry-After": str(reset_window_seconds)},
        )

    user = db.query(User).filter(User.email == payload.email).one_or_none()
    if user and user.status == "active":
        user.password_hash = hash_password(user.identification)
        user.password_change_required = True
        db.query(RefreshSession).filter(
            RefreshSession.ps405Identification == user.identification,
            RefreshSession.revoked.is_(False),
        ).update({"revoked": True})
        clear_failed_logins(payload.email)
        clear_failed_logins(user.identification)
        write_audit(
            db,
            action="password_reset_requested",
            event="permission_change",
            module="auth",
            user_id=user.identification,
            auditable_type="User",
            auditable_id=user.identification,
            new_values={"password_change_required": True},
            severity="critical",
            tags=["authentication", "password"],
            request=request,
        )
        db.commit()
    elif user:
        write_audit(
            db,
            action="password_reset_inactive_user",
            event="failed_login",
            module="auth",
            user_id=user.identification,
            result="denied",
            severity="warning",
            tags=["authentication", "password"],
            request=request,
        )
        db.commit()

    return {
        "ok": True,
        "message": "Si la cuenta existe y esta activa, la clave fue restablecida a la identificacion y debera cambiarse al ingresar.",
    }


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    refresh_token = payload.refresh_token or request.cookies.get("ambar_refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    try:
        token_payload = decode_token(refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc
    if token_payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    session = db.query(RefreshSession).filter(RefreshSession.refresh_jti == token_payload["jti"]).one_or_none()
    if not session or session.revoked or _is_expired(session.expires_at):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh session expired")
    user = db.get(User, token_payload["sub"])
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    permissions = sorted(user_permissions(db, user))
    roles = _role_names(user)
    settings = get_settings()
    access_token = create_token(
        user.identification,
        "access",
        minutes=settings.access_token_expire_minutes,
        roles=roles,
        permissions=permissions,
        company_id=user.company_id,
        location_id=user.location_id,
    )
    write_audit(db, action="token_refreshed", event="login", module="auth", user_id=user.identification, tags=["authentication"], request=request)
    db.commit()
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout")
def logout(payload: RefreshRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    # Revocar access token activo añadiéndolo a blacklist
    access_token = request.cookies.get("ambar_access_token")
    if not access_token:
        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            access_token = authorization.split(" ", 1)[1].strip()

    if access_token:
        try:
            at_payload = decode_token(access_token)
            jti = at_payload.get("jti")
            exp = at_payload.get("exp", 0)
            if jti and exp:
                from datetime import UTC as _UTC
                ttl = max(int(exp - datetime.now(_UTC).timestamp()), 0) + 60
                blacklist_token(jti, ttl)
        except Exception:
            pass

    refresh_token = payload.refresh_token or request.cookies.get("ambar_refresh_token")
    if not refresh_token:
        _clear_auth_cookies(response)
        return {"ok": True}
    try:
        token_payload = decode_token(refresh_token)
    except ValueError:
        _clear_auth_cookies(response)
        return {"ok": True}
    session = db.query(RefreshSession).filter(RefreshSession.refresh_jti == token_payload.get("jti")).one_or_none()
    if session:
        session.revoked = True
        write_audit(
            db,
            action="logout",
            event="logout",
            module="auth",
            user_id=session.ps405Identification,
            auditable_type="User",
            auditable_id=session.ps405Identification,
            tags=["authentication"],
            request=request,
        )
        db.commit()
    _clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    return _me_response(user, db)


@router.get("/session", response_model=SessionStatusResponse)
def session_status(request: Request, db: Session = Depends(get_db)) -> SessionStatusResponse:
    user = _optional_current_user(request, db)
    if not user:
        return SessionStatusResponse(authenticated=False)
    return SessionStatusResponse(
        authenticated=True,
        user=_me_response(user, db),
    )
