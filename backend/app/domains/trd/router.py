from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import TrdDisposition, TrdSeries, TrdSubseries, User
from app.db.session import get_db
from app.services.audit import write_audit

router = APIRouter(prefix="/trd", tags=["trd"])


class SeriesCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=3, max_length=160)
    description: str | None = None


class SubseriesCreate(BaseModel):
    series_id: int
    name: str = Field(min_length=3, max_length=160)
    retention_years: int = Field(ge=1, le=100)


class DispositionCreate(BaseModel):
    subseries_id: int
    archive_management: int = Field(ge=0, le=100)
    archive_central: int = Field(ge=0, le=100)
    final_action: str = Field(min_length=3, max_length=120)


@router.get("/series")
def list_series(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))):
    return db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()


@router.post("/series", status_code=status.HTTP_201_CREATED)
def create_series(
    payload: SeriesCreate,
    request: Request,
    user: User = Depends(require_permission("trd.manage")),
    db: Session = Depends(get_db),
):
    if db.query(TrdSeries).filter(TrdSeries.code == payload.code).first():
        raise HTTPException(status_code=409, detail="Series code already exists")
    item = TrdSeries(**payload.model_dump())
    db.add(item)
    db.flush()
    write_audit(db, action="trd_series_created", module="trd", user_id=user.identification, entity="series", entity_id=item.idSeries, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/subseries")
def list_subseries(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))):
    return db.query(TrdSubseries).order_by(TrdSubseries.name.asc()).all()


@router.post("/subseries", status_code=status.HTTP_201_CREATED)
def create_subseries(
    payload: SubseriesCreate,
    request: Request,
    user: User = Depends(require_permission("trd.manage")),
    db: Session = Depends(get_db),
):
    if not db.get(TrdSeries, payload.series_id):
        raise HTTPException(status_code=404, detail="Series not found")
    item = TrdSubseries(ps610IdSeries=payload.series_id, name=payload.name, retention_years=payload.retention_years)
    db.add(item)
    db.flush()
    write_audit(db, action="trd_subseries_created", module="trd", user_id=user.identification, entity="subseries", entity_id=item.idSubseries, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/dispositions")
def list_dispositions(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))):
    return db.query(TrdDisposition).order_by(TrdDisposition.idDisposition.desc()).all()


@router.post("/dispositions", status_code=status.HTTP_201_CREATED)
def create_disposition(
    payload: DispositionCreate,
    request: Request,
    user: User = Depends(require_permission("trd.manage")),
    db: Session = Depends(get_db),
):
    if not db.get(TrdSubseries, payload.subseries_id):
        raise HTTPException(status_code=404, detail="Subseries not found")
    item = TrdDisposition(
        ps612IdSubseries=payload.subseries_id,
        archive_management=payload.archive_management,
        archive_central=payload.archive_central,
        final_action=payload.final_action,
    )
    db.add(item)
    db.flush()
    write_audit(db, action="trd_disposition_created", module="trd", user_id=user.identification, entity="disposition", entity_id=item.idDisposition, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item
