from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.core.security import enforce_password_policy, hash_password
from app.db.models import Role, User, UserRole
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


class UserOut(BaseModel):
    identification: str
    name: str
    email: EmailStr
    status: str
    company_id: str
    location_id: int | None
    roles: list[str]


def _out(user: User) -> UserOut:
    return UserOut(
        identification=user.identification,
        name=user.name,
        email=user.email,
        status=user.status,
        company_id=user.company_id,
        location_id=user.location_id,
        roles=[item.role.role_name for item in user.roles],
    )


@router.get("", response_model=list[UserOut])
def list_users(
    _: User = Depends(require_permission("users.manage")),
    db: Session = Depends(get_db),
) -> list[UserOut]:
    return [_out(user) for user in db.query(User).order_by(User.created_at.desc()).all()]


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
    return _out(user)


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
    old_values = {"name": user.name, "status": user.status, "roles": [item.role.role_name for item in user.roles]}
    if payload.name is not None:
        user.name = payload.name
    if payload.status is not None:
        user.status = payload.status
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
    return _out(user)
