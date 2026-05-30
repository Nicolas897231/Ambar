from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AuditLog, Document, Expedient, Folder, TrdDisposition, TrdSeries, TrdSubseries, User
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


class RetentionUpdate(BaseModel):
    retention_years: int = Field(ge=1, le=100)


def _series_out(series: TrdSeries) -> dict:
    return {"idSeries": series.idSeries, "code": series.code, "name": series.name, "description": series.description}


def _subseries_out(subseries: TrdSubseries) -> dict:
    return {
        "idSubseries": subseries.idSubseries,
        "ps610IdSeries": subseries.ps610IdSeries,
        "name": subseries.name,
        "retention_years": subseries.retention_years,
    }


def _document_out(document: Document) -> dict:
    return {
        "idDocument": document.idDocument,
        "document_name": document.document_name,
        "document_type": document.document_type,
        "status": document.status,
        "version": document.version,
        "archive_id": document.ps930IdArchive,
        "expedient_id": document.ps950IdExpedient,
        "folder_id": document.ps952IdFolder,
        "folio_start": document.folio_start,
        "folio_end": document.folio_end,
        "folio_total": document.folio_total,
    }


def _expedient_out(expedient: Expedient) -> dict:
    return {
        "idExpedient": expedient.idExpedient,
        "expedient_code": expedient.expedient_code,
        "expedient_name": expedient.expedient_name,
        "status": expedient.status,
        "archive_id": expedient.ps930IdArchive,
        "series_id": expedient.ps610IdSeries,
        "subseries_id": expedient.ps612IdSubseries,
        "document_count": expedient.document_count,
        "folio_count": expedient.folio_count,
    }


def _disposition_out(disposition: TrdDisposition) -> dict:
    return {
        "idDisposition": disposition.idDisposition,
        "subseries_id": disposition.ps612IdSubseries,
        "archive_management": disposition.archive_management,
        "archive_central": disposition.archive_central,
        "final_action": disposition.final_action,
    }


def _audit_out(audit: AuditLog) -> dict:
    return {
        "idAudit": audit.idAudit,
        "action": audit.action,
        "module": audit.module,
        "entity": audit.entity,
        "entity_id": audit.entity_id,
        "result": audit.result,
        "severity": audit.severity,
        "created_at": audit.created_at,
    }


@router.get("/series")
def list_series(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))):
    return db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()


@router.get("/series/tree")
def series_tree(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> list[dict]:
    series_rows = db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()
    subseries_rows = db.query(TrdSubseries).order_by(TrdSubseries.name.asc()).all()
    by_series: dict[int, list[TrdSubseries]] = {}
    for subseries in subseries_rows:
        by_series.setdefault(subseries.ps610IdSeries, []).append(subseries)
    return [
        {
            "idSeries": series.idSeries,
            "code": series.code,
            "name": series.name,
            "description": series.description,
            "subseries": [
                {
                    "idSubseries": subseries.idSubseries,
                    "name": subseries.name,
                    "retention_years": subseries.retention_years,
                    "active_expedients": db.query(Expedient).filter(Expedient.ps612IdSubseries == subseries.idSubseries, Expedient.status == "active").count(),
                    "documents": db.query(Document).filter(Document.ps612IdSubseries == subseries.idSubseries).count(),
                }
                for subseries in by_series.get(series.idSeries, [])
            ],
        }
        for series in series_rows
    ]


@router.get("/series/{series_id}/workspace")
def series_workspace(series_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> dict:
    series = db.get(TrdSeries, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    subseries = db.query(TrdSubseries).filter(TrdSubseries.ps610IdSeries == series_id).order_by(TrdSubseries.name.asc()).all()
    subseries_ids = [item.idSubseries for item in subseries]
    return {
        "series": _series_out(series),
        "subseries": [_subseries_out(item) for item in subseries],
        "kpis": {
            "total_expedients": db.query(Expedient).filter(Expedient.ps610IdSeries == series_id).count(),
            "active_expedients": db.query(Expedient).filter(Expedient.ps610IdSeries == series_id, Expedient.status == "active").count(),
            "closed_expedients": db.query(Expedient).filter(Expedient.ps610IdSeries == series_id, Expedient.status == "closed").count(),
            "total_documents": db.query(Document).filter(Document.ps612IdSubseries.in_(subseries_ids)).count() if subseries_ids else 0,
            "total_folders": db.query(Folder).join(Expedient, Expedient.idExpedient == Folder.ps950IdExpedient).filter(Expedient.ps610IdSeries == series_id).count(),
        },
        "dispositions": [
            _disposition_out(item)
            for item in (db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries.in_(subseries_ids)).all() if subseries_ids else [])
        ],
    }


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


@router.get("/subseries/{subseries_id}/workspace")
def subseries_workspace(subseries_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> dict:
    subseries = db.get(TrdSubseries, subseries_id)
    if not subseries:
        raise HTTPException(status_code=404, detail="Subseries not found")
    expedients = db.query(Expedient).filter(Expedient.ps612IdSubseries == subseries_id).order_by(Expedient.created_at.desc()).limit(100).all()
    documents = db.query(Document).filter(Document.ps612IdSubseries == subseries_id).order_by(Document.created_at.desc()).limit(100).all()
    disposition = db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries_id).order_by(TrdDisposition.idDisposition.desc()).first()
    audit = db.query(AuditLog).filter(AuditLog.module == "trd", AuditLog.entity_id == str(subseries_id)).order_by(AuditLog.created_at.desc()).limit(20).all()
    return {
        "subseries": _subseries_out(subseries),
        "series": _series_out(subseries.series),
        "document_types": [],
        "expedients": [_expedient_out(item) for item in expedients],
        "documents": [_document_out(item) for item in documents],
        "retention": {
            "management_years": disposition.archive_management if disposition else 0,
            "central_years": disposition.archive_central if disposition else subseries.retention_years,
            "total_years": subseries.retention_years,
            "final_action": disposition.final_action if disposition else "Pendiente",
        },
        "audit": [_audit_out(item) for item in audit],
    }


@router.get("/subseries/{subseries_id}/retention-timeline")
def retention_timeline(subseries_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> dict:
    subseries = db.get(TrdSubseries, subseries_id)
    if not subseries:
        raise HTTPException(status_code=404, detail="Subseries not found")
    disposition = db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries_id).order_by(TrdDisposition.idDisposition.desc()).first()
    management = disposition.archive_management if disposition else 0
    central = disposition.archive_central if disposition else subseries.retention_years
    return {
        "subseries_id": subseries_id,
        "steps": [
            {"stage": "Gestion", "years": management, "description": "Retencion en archivo de gestion"},
            {"stage": "Central", "years": central, "description": "Retencion en archivo central"},
            {"stage": "Historico", "years": None, "description": disposition.final_action if disposition else "Disposicion final pendiente"},
        ],
    }


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


@router.patch("/subseries/{subseries_id}/retention")
def update_retention(
    subseries_id: int,
    payload: RetentionUpdate,
    request: Request,
    user: User = Depends(require_permission("trd.manage")),
    db: Session = Depends(get_db),
):
    item = db.get(TrdSubseries, subseries_id)
    if not item:
        raise HTTPException(status_code=404, detail="Subseries not found")
    old_values = {"retention_years": item.retention_years}
    item.retention_years = payload.retention_years
    write_audit(db, action="trd_retention_updated", module="trd", user_id=user.identification, entity="subseries", entity_id=item.idSubseries, old_values=old_values, new_values=payload.model_dump(), request=request)
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
