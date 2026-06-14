from collections.abc import Callable
from datetime import UTC, datetime

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_token
from app.db.models import Permission, RolePermission, User, UserRole
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.cache import is_token_blacklisted

bearer = HTTPBearer(auto_error=False)


def _access_token_from_request(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if credentials:
        return credentials.credentials
    return request.cookies.get("ambar_access_token")


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    token = _access_token_from_request(request, credentials)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    # Verificar token blacklist (logout explícito o revocación de sesión)
    jti = payload.get("jti")
    if jti and is_token_blacklisted(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

    user = db.get(User, payload.get("sub"))
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    # Verificar acceso temporal expirado
    if user.access_expires_at is not None:
        expires = user.access_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if expires < datetime.now(UTC):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User access has expired")

    return user


def user_permissions(db: Session, user: User) -> set[str]:
    role_ids = [
        row.ps407IdRole
        for row in db.query(UserRole).filter(UserRole.ps405Identification == user.identification).all()
    ]
    if not role_ids:
        return set()
    return {
        item.permission_key
        for item in db.query(Permission.permission_key)
        .join(RolePermission, RolePermission.ps409IdPermission == Permission.idPermission)
        .filter(RolePermission.ps407IdRole.in_(role_ids))
        .all()
    }


def require_permission(permission: str) -> Callable:
    def dependency(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        permissions = user_permissions(db, user)
        if "*" not in permissions and permission not in permissions:
            write_audit(
                db,
                action="access_denied",
                event="access_denied",
                module="security",
                user_id=user.identification,
                entity="permission",
                entity_id=permission,
                auditable_type="Permission",
                result="denied",
                severity="critical",
                new_values={"required_permission": permission},
                request=request,
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")
        return user

    return dependency


def require_any_permission(*permissions: str) -> Callable:
    def dependency(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
        granted = user_permissions(db, user)
        if "*" not in granted and not any(permission in granted for permission in permissions):
            write_audit(
                db,
                action="access_denied",
                event="access_denied",
                module="security",
                user_id=user.identification,
                entity="permission",
                entity_id="|".join(permissions),
                auditable_type="Permission",
                result="denied",
                severity="critical",
                new_values={"required_any_permission": list(permissions)},
                request=request,
            )
            db.commit()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")
        return user

    return dependency


def validate_internal_request(x_internal_signature: str | None = Header(default=None)) -> None:
    if x_internal_signature != get_settings().internal_service_secret:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal signature")


def enforce_document_scope(request: Request, document_company: str, document_location: int | None, user: User) -> None:
    if user.company_id != document_company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    permissions = getattr(request.state, "permissions", set())
    if "document.read_all" not in permissions and user.location_id and document_location != user.location_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
