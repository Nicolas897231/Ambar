from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.core.security import enforce_password_policy, hash_password
from app.db.models import Permission, RefreshSession, Role, RolePermission, User, UserRole
from app.db.session import get_db
from app.services.audit import write_audit

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    identification: str = Field(min_length=4, max_length=40)
    name: str = Field(min_length=3, max_length=160)
    email: EmailStr
    password: str
    role_names: list[str] = Field(default_factory=lambda: ["viewer"])
    company_id: str = "default"
    location_id: int | None = 1


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


class UserOut(BaseModel):
    identification: str
    name: str
    email: EmailStr
    status: str
    company_id: str
    location_id: int | None
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
    db.refresh(role)
    return _role_out(role)


@router.get("", response_model=list[UserOut])
def list_users(
    include_inactive: bool = Query(default=False),
    _: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    query = db.query(User)
    if not include_inactive:
        query = query.filter(User.status == "active")
    return [_out(user, db) for user in query.order_by(User.created_at.desc()).all()]


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
        enforce_password_policy(payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    roles = db.query(Role).filter(Role.role_name.in_(payload.role_names)).all()
    if len(roles) != len(set(payload.role_names)):
        raise HTTPException(status_code=422, detail="Unknown role")
    user = User(
        identification=payload.identification,
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        company_id=payload.company_id,
        location_id=payload.location_id,
        status="active",
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
        new_values={"email": user.email, "roles": payload.role_names},
        request=request,
    )
    db.commit()
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
