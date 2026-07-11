from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from datetime import datetime
import re

from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session, selectinload

from app.core.deps import require_permission
from app.core.security import enforce_password_policy, generate_totp_secret, hash_password, totp_uri
from app.db.models import Permission, RefreshSession, Role, RolePermission, User, UserRole
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.cache import delete_pattern

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    identification: str = Field(min_length=6, max_length=12)
    name: str = Field(min_length=3, max_length=160)
    email: EmailStr
    password: str | None = None
    role_names: list[str] = Field(default_factory=lambda: ["viewer"])
    company_id: str = "default"
    location_id: int | None = 1
    phone: str | None = Field(default=None, min_length=10, max_length=10)
    position_name: str | None = Field(default=None, min_length=2, max_length=120)
    department_name: str | None = Field(default=None, min_length=2, max_length=120)
    auth_method: str = Field(default="temporary_password", pattern="^(temporary_password|corporate_directory)$")
    mfa_enabled: bool = False
    mechanical_signature_enabled: bool = False
    digital_signature_ready: bool = False
    access_expires_at: datetime | None = None
    status: str = Field(default="active", pattern="^(active|inactive|locked)$")

    @field_validator("identification")
    @classmethod
    def validate_identification(cls, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"\d{6,12}", normalized):
            raise ValueError("Identification must contain only 6 to 12 digits")
        return normalized

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not re.fullmatch(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{3,160}", normalized):
            raise ValueError("Name must contain only letters and spaces")
        return normalized

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        normalized = value.strip()
        if not re.fullmatch(r"\d{10}", normalized):
            raise ValueError("Phone must contain exactly 10 digits")
        return normalized


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=160)
    status: str | None = Field(default=None, pattern="^(active|inactive|locked)$")
    role_names: list[str] | None = None
    location_id: int | None = None


class RoleCreate(BaseModel):
    role_name: str = Field(min_length=3, max_length=80, pattern="^[a-z0-9_]+$")
    description: str = Field(min_length=3, max_length=255)
    permissions: list[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    description: str | None = Field(default=None, min_length=3, max_length=255)
    permissions: list[str] | None = None


class MfaSetupOut(BaseModel):
    identification: str
    email: EmailStr
    mfa_enabled: bool
    secret: str
    otpauth_uri: str


class UserOut(BaseModel):
    identification: str
    name: str
    email: EmailStr
    status: str
    company_id: str
    location_id: int | None
    phone: str | None = None
    position_name: str | None = None
    department_name: str | None = None
    auth_method: str = "temporary_password"
    mfa_enabled: bool = False
    mfa_configured: bool = False
    mechanical_signature_enabled: bool = False
    digital_signature_ready: bool = False
    access_expires_at: datetime | None = None
    roles: list[str]
    permissions: list[str]


class PermissionOut(BaseModel):
    idPermission: int
    permission_key: str
    module: str
    description: str


class RoleOut(BaseModel):
    idRole: int
    role_name: str
    description: str
    permissions: list[str]


def _role_names(user: User) -> list[str]:
    return [item.role.role_name for item in user.roles]


def _permission_keys_for_roles(db: Session, role_ids: list[int]) -> list[str]:
    if not role_ids:
        return []
    return sorted(
        row.permission_key
        for row in db.query(Permission.permission_key)
        .join(RolePermission, RolePermission.ps409IdPermission == Permission.idPermission)
        .filter(RolePermission.ps407IdRole.in_(role_ids))
        .all()
    )


def _out(user: User, db: Session) -> UserOut:
    role_ids = [item.ps407IdRole for item in user.roles]
    return UserOut(
        identification=user.identification,
        name=user.name,
        email=user.email,
        status=user.status,
        company_id=user.company_id,
        location_id=user.location_id,
        phone=user.phone,
        position_name=user.position_name,
        department_name=user.department_name,
        auth_method=user.auth_method or "temporary_password",
        mfa_enabled=bool(user.mfa_enabled),
        mfa_configured=bool(user.mfa_secret),
        mechanical_signature_enabled=bool(user.mechanical_signature_enabled),
        digital_signature_ready=bool(user.digital_signature_ready),
        access_expires_at=user.access_expires_at,
        roles=_role_names(user),
        permissions=_permission_keys_for_roles(db, role_ids),
    )


def _role_out(role: Role) -> RoleOut:
    return RoleOut(
        idRole=role.idRole,
        role_name=role.role_name,
        description=role.description,
        permissions=sorted(item.permission.permission_key for item in role.permissions),
    )


def _permissions_by_key(db: Session, keys: list[str]) -> list[Permission]:
    normalized = sorted(set(keys))
    if not normalized:
        return []
    permissions = db.query(Permission).filter(Permission.permission_key.in_(normalized)).all()
    if len(permissions) != len(normalized):
        found = {item.permission_key for item in permissions}
        missing = sorted(set(normalized) - found)
        raise HTTPException(status_code=422, detail=f"Unknown permissions: {', '.join(missing)}")
    return permissions


def _invalidate_permission_cache(identification: str | None = None) -> None:
    delete_pattern(f"user_permissions:{identification}" if identification else "user_permissions:*")


@router.get("/permissions", response_model=list[PermissionOut])
def list_permissions(
    _: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> list[PermissionOut]:
    return [
        PermissionOut(
            idPermission=item.idPermission,
            permission_key=item.permission_key,
            module=item.module,
            description=item.description,
        )
        for item in db.query(Permission).order_by(Permission.module.asc(), Permission.permission_key.asc()).all()
    ]


@router.get("/roles", response_model=list[RoleOut])
def list_roles(
    _: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> list[RoleOut]:
    return [_role_out(role) for role in db.query(Role).order_by(Role.role_name.asc()).all()]


@router.post("/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> RoleOut:
    if db.query(Role).filter(Role.role_name == payload.role_name).first():
        raise HTTPException(status_code=409, detail="Role already exists")
    permissions = _permissions_by_key(db, payload.permissions)
    role = Role(role_name=payload.role_name, description=payload.description)
    db.add(role)
    db.flush()
    for permission in permissions:
        db.add(RolePermission(ps407IdRole=role.idRole, ps409IdPermission=permission.idPermission))
    write_audit(
        db,
        action="role_created",
        module="users",
        user_id=actor.identification,
        entity="role",
        entity_id=role.idRole,
        new_values=payload.model_dump(),
        request=request,
    )
    db.commit()
    _invalidate_permission_cache()
    db.refresh(role)
    return _role_out(role)


@router.patch("/roles/{role_id}", response_model=RoleOut)
def update_role(
    role_id: int,
    payload: RoleUpdate,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> RoleOut:
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.role_name == "super_admin" and payload.permissions is not None and "*" not in payload.permissions:
        raise HTTPException(status_code=422, detail="super_admin must keep wildcard permission")
    old_values = {"description": role.description, "permissions": [item.permission.permission_key for item in role.permissions]}
    if payload.description is not None:
        role.description = payload.description
    if payload.permissions is not None:
        permissions = _permissions_by_key(db, payload.permissions)
        db.query(RolePermission).filter(RolePermission.ps407IdRole == role.idRole).delete()
        db.flush()
        for permission in permissions:
            db.add(RolePermission(ps407IdRole=role.idRole, ps409IdPermission=permission.idPermission))
    write_audit(
        db,
        action="role_updated",
        module="users",
        user_id=actor.identification,
        entity="role",
        entity_id=role.idRole,
        old_values=old_values,
        new_values=payload.model_dump(exclude_unset=True),
        request=request,
    )
    db.commit()
    _invalidate_permission_cache()
    db.refresh(role)
    return _role_out(role)


@router.get("", response_model=list[UserOut])
def list_users(
    include_inactive: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=250),
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    query = db.query(User).options(selectinload(User.roles).selectinload(UserRole.role)).filter(User.company_id == actor.company_id)
    if not include_inactive:
        query = query.filter(User.status == "active")
    return [_out(user, db) for user in query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> UserOut:
    if db.get(User, payload.identification) or db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="User already exists")
    try:
        initial_password = payload.password or payload.identification
        if initial_password != payload.identification:
            enforce_password_policy(initial_password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    roles = db.query(Role).filter(Role.role_name.in_(payload.role_names)).all()
    if len(roles) != len(set(payload.role_names)):
        raise HTTPException(status_code=422, detail="Unknown role")
    user = User(
        identification=payload.identification,
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(initial_password),
        company_id=payload.company_id,
        location_id=payload.location_id,
        phone=payload.phone,
        position_name=payload.position_name,
        department_name=payload.department_name,
        auth_method=payload.auth_method,
        mfa_enabled=payload.mfa_enabled,
        mfa_secret=generate_totp_secret() if payload.mfa_enabled else None,
        mechanical_signature_enabled=payload.mechanical_signature_enabled,
        digital_signature_ready=payload.digital_signature_ready,
        access_expires_at=payload.access_expires_at,
        status=payload.status,
    )
    db.add(user)
    db.flush()
    for role in roles:
        db.add(UserRole(ps405Identification=user.identification, ps407IdRole=role.idRole))
    write_audit(
        db,
        action="user_created",
        module="users",
        user_id=actor.identification,
        entity="user",
        entity_id=user.identification,
        new_values={
            "email": user.email,
            "roles": payload.role_names,
            "phone": user.phone,
            "position_name": user.position_name,
            "department_name": user.department_name,
            "auth_method": user.auth_method,
            "mfa_enabled": user.mfa_enabled,
            "mechanical_signature_enabled": user.mechanical_signature_enabled,
            "digital_signature_ready": user.digital_signature_ready,
            "access_expires_at": user.access_expires_at.isoformat() if user.access_expires_at else None,
        },
        request=request,
    )
    db.commit()
    _invalidate_permission_cache(user.identification)
    db.refresh(user)
    return _out(user, db)


@router.post("/{identification}/mfa/setup", response_model=MfaSetupOut)
def setup_mfa(
    identification: str,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> MfaSetupOut:
    user = db.get(User, identification)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old_values = {"mfa_enabled": user.mfa_enabled, "mfa_configured": bool(user.mfa_secret)}
    if not user.mfa_secret:
        user.mfa_secret = generate_totp_secret()
    user.mfa_enabled = True
    write_audit(
        db,
        action="user_mfa_configured",
        module="users",
        user_id=actor.identification,
        entity="user",
        entity_id=user.identification,
        old_values=old_values,
        new_values={"mfa_enabled": True, "mfa_configured": True},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return MfaSetupOut(
        identification=user.identification,
        email=user.email,
        mfa_enabled=True,
        secret=user.mfa_secret,
        otpauth_uri=totp_uri(user.mfa_secret, user.email),
    )


@router.post("/{identification}/mfa/disable", response_model=UserOut)
def disable_mfa(
    identification: str,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> UserOut:
    user = db.get(User, identification)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old_values = {"mfa_enabled": user.mfa_enabled, "mfa_configured": bool(user.mfa_secret)}
    user.mfa_enabled = False
    user.mfa_secret = None
    write_audit(
        db,
        action="user_mfa_disabled",
        module="users",
        user_id=actor.identification,
        entity="user",
        entity_id=user.identification,
        old_values=old_values,
        new_values={"mfa_enabled": False, "mfa_configured": False},
        request=request,
    )
    db.commit()
    _invalidate_permission_cache(user.identification)
    db.refresh(user)
    return _out(user, db)


@router.patch("/{identification}", response_model=UserOut)
def update_user(
    identification: str,
    payload: UserUpdate,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> UserOut:
    user = db.get(User, identification)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old_values = {"name": user.name, "status": user.status, "roles": _role_names(user)}
    if payload.name is not None:
        user.name = payload.name
    if payload.status is not None:
        if user.identification == actor.identification and payload.status != "active":
            raise HTTPException(status_code=422, detail="You cannot disable your own account")
        user.status = payload.status
        if payload.status != "active":
            db.query(RefreshSession).filter(RefreshSession.ps405Identification == user.identification).update({"revoked": True})
    if payload.location_id is not None:
        user.location_id = payload.location_id
    if payload.role_names is not None:
        roles = db.query(Role).filter(Role.role_name.in_(payload.role_names)).all()
        if len(roles) != len(set(payload.role_names)):
            raise HTTPException(status_code=422, detail="Unknown role")
        db.query(UserRole).filter(UserRole.ps405Identification == user.identification).delete()
        db.flush()
        for role in roles:
            db.add(UserRole(ps405Identification=user.identification, ps407IdRole=role.idRole))
    write_audit(
        db,
        action="user_updated",
        module="users",
        user_id=actor.identification,
        entity="user",
        entity_id=user.identification,
        old_values=old_values,
        new_values=payload.model_dump(exclude_unset=True),
        request=request,
    )
    db.commit()
    _invalidate_permission_cache(user.identification)
    db.refresh(user)
    return _out(user, db)


@router.delete("/{identification}", response_model=UserOut)
def deactivate_user(
    identification: str,
    request: Request,
    actor: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> UserOut:
    user = db.get(User, identification)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.identification == actor.identification:
        raise HTTPException(status_code=422, detail="You cannot disable your own account")
    old_values = {"status": user.status, "roles": _role_names(user)}
    user.status = "inactive"
    db.query(RefreshSession).filter(RefreshSession.ps405Identification == user.identification).update({"revoked": True})
    write_audit(
        db,
        action="user_deactivated",
        module="users",
        user_id=actor.identification,
        entity="user",
        entity_id=user.identification,
        old_values=old_values,
        new_values={"status": "inactive"},
        request=request,
    )
    db.commit()
    db.refresh(user)
    return _out(user, db)
