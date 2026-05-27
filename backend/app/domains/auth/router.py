from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user, user_permissions
from app.core.security import create_token, decode_token, verify_password
from app.db.models import RefreshSession, User
from app.db.session import get_db
from app.services.audit import write_audit

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


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


def _role_names(user: User) -> list[str]:
    return [item.role.role_name for item in user.roles]


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


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).one_or_none()
    if not user or not verify_password(payload.password, user.password_hash) or user.status != "active":
        write_audit(
            db,
            action="login_failed",
            module="auth",
            user_id=user.identification if user else None,
            new_values={"email": payload.email},
            result="failed",
            severity="warning",
            request=request,
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

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
    write_audit(db, action="login_success", module="auth", user_id=user.identification, request=request)
    db.commit()
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


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
    write_audit(db, action="token_refreshed", module="auth", user_id=user.identification, request=request)
    db.commit()
    _set_auth_cookies(response, access_token, refresh_token)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
    )


@router.post("/logout")
def logout(payload: RefreshRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
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
        write_audit(db, action="logout", module="auth", user_id=session.ps405Identification, request=request)
        db.commit()
    _clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    return MeResponse(
        identification=user.identification,
        name=user.name,
        email=user.email,
        roles=_role_names(user),
        permissions=sorted(user_permissions(db, user)),
    )
