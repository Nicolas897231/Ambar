import logging
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import Document, DocumentLoan, Expedient, Folder, KardexMovement, PhysicalBox, TransferBatch, TransferBatchItem, User
from app.db.session import get_db
from app.domains.archives.router import _require_archive_access, allowed_archive_ids
from app.services.audit import write_audit
from app.services.cache import cached

router = APIRouter(prefix="/kardex", tags=["kardex"])
logger = logging.getLogger(__name__)


def _authorized_archive_filter(ids: list[int]):
    return or_(KardexMovement.ps930OriginArchiveId.in_(ids), KardexMovement.ps930DestinationArchiveId.in_(ids))


def _base_query(db: Session, user: User):
    ids = allowed_archive_ids(db, user)
    if not ids:
        return db.query(KardexMovement).filter(KardexMovement.idMovement == -1)
    return db.query(KardexMovement).filter(_authorized_archive_filter(ids))


def _movement_to_dict(item: KardexMovement) -> dict:
    return {
        "idMovement": item.idMovement,
        "movement_code": item.movement_code or f"KDX-{item.idMovement:08d}",
        "event_type": item.movement_type,
        "movement_type": item.movement_type,
        "entity_type": item.entity_type,
        "entity_id": item.entity_id,
        "related_document_id": item.related_document_id,
        "related_folder_id": item.related_folder_id,
        "related_expedient_id": item.related_expedient_id,
        "related_box_id": item.related_box_id,
        "related_transfer_id": item.related_transfer_id,
        "related_loan_id": item.related_loan_id,
        "origin_archive_id": item.ps930OriginArchiveId,
        "destination_archive_id": item.ps930DestinationArchiveId,
        "origin_location_id": item.origin_location_id,
        "destination_location_id": item.destination_location_id,
        "action_by": item.ps405ActorIdentification,
        "action_at": item.created_at,
        "origin_custodian_id": item.custodian_from,
        "destination_custodian_id": item.custodian_to,
        "previous_status": item.previous_status,
        "new_status": item.status,
        "status": item.status,
        "observation": item.observations,
        "rejection_reason": item.reason,
        "evidence_url": item.evidence_url,
        "ip_address": item.ip_address,
        "user_agent": item.user_agent,
        "metadata": item.metadata_json or {},
        "created_at": item.created_at,
    }


def _apply_filters(query, *, archive_id: int | None, entity_type: str | None, movement_type: str | None, status: str | None, user_id: str | None, date_from: datetime | None, date_to: datetime | None, transfer_id: int | None, expedient_id: int | None, folder_id: int | None, box_id: int | None, loan_id: int | None, rejection_reason: str | None, evidence: str | None):
    if archive_id:
        query = query.filter(or_(KardexMovement.ps930OriginArchiveId == archive_id, KardexMovement.ps930DestinationArchiveId == archive_id))
    if entity_type:
        query = query.filter(KardexMovement.entity_type == entity_type)
    if movement_type:
        query = query.filter(KardexMovement.movement_type == movement_type)
    if status:
        query = query.filter(KardexMovement.status == status)
    if user_id:
        query = query.filter(KardexMovement.ps405ActorIdentification == user_id)
    if date_from:
        query = query.filter(KardexMovement.created_at >= date_from)
    if date_to:
        query = query.filter(KardexMovement.created_at <= date_to)
    if transfer_id:
        query = query.filter(or_(KardexMovement.related_transfer_id == transfer_id, and_(KardexMovement.entity_type == "batch", KardexMovement.entity_id == transfer_id)))
    if expedient_id:
        query = query.filter(or_(KardexMovement.related_expedient_id == expedient_id, and_(KardexMovement.entity_type == "expedient", KardexMovement.entity_id == expedient_id)))
    if folder_id:
        query = query.filter(or_(KardexMovement.related_folder_id == folder_id, and_(KardexMovement.entity_type == "folder", KardexMovement.entity_id == folder_id)))
    if box_id:
        query = query.filter(or_(KardexMovement.related_box_id == box_id, and_(KardexMovement.entity_type == "box", KardexMovement.entity_id == box_id)))
    if loan_id:
        query = query.filter(or_(KardexMovement.related_loan_id == loan_id, and_(KardexMovement.entity_type == "loan", KardexMovement.entity_id == loan_id)))
    if rejection_reason:
        query = query.filter(KardexMovement.reason == rejection_reason)
    if evidence == "with":
        query = query.filter(KardexMovement.evidence_url.is_not(None))
    elif evidence == "without":
        query = query.filter(KardexMovement.evidence_url.is_(None))
    return query


@router.get("/summary")
def summary(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    return cached(f"kardex:summary:{user.identification}", lambda: _summary_payload(user, db), ttl=45)


def _summary_payload(user: User, db: Session):
    fallback = {"documents": 0, "folders": 0, "expedients": 0, "boxes": 0, "pending_transfers": 0, "pending_receptions": 0, "overdue_loans": 0, "today_movements": 0, "recent_rejections": 0, "fuid_inconsistencies": 0, "unfoliated_documents": 0}
    try:
        ids = allowed_archive_ids(db, user)
        if not ids:
            return fallback
        today = datetime.now().date()
        movements = _base_query(db, user)
        return {
            "documents": db.query(Document).filter(Document.ps930IdArchive.in_(ids)).count(),
            "folders": db.query(Folder).filter(Folder.ps930IdArchive.in_(ids)).count(),
            "expedients": db.query(Expedient).filter(Expedient.ps930IdArchive.in_(ids)).count(),
            "boxes": db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive.in_(ids)).count(),
            "pending_transfers": db.query(TransferBatch).filter(or_(TransferBatch.ps930OriginArchiveId.in_(ids), TransferBatch.ps930DestinationArchiveId.in_(ids)), TransferBatch.status.in_(["pending", "approved", "packed", "shipped", "under_review"])).count(),
            "pending_receptions": db.query(TransferBatchItem).filter(or_(TransferBatchItem.ps930OriginArchiveId.in_(ids), TransferBatchItem.ps930DestinationArchiveId.in_(ids)), TransferBatchItem.status.in_(["pending", "pending_review", "with_inconsistency"])).count(),
            "overdue_loans": db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive.in_(ids), DocumentLoan.status == "overdue").count(),
            "today_movements": movements.filter(KardexMovement.created_at >= datetime.combine(today, datetime.min.time())).count(),
            "recent_rejections": movements.filter(KardexMovement.status == "rejected").count(),
            "fuid_inconsistencies": movements.filter(KardexMovement.movement_type.in_(["reception.item.partially_received", "reception.item.rejected"])).count(),
            "unfoliated_documents": db.query(Document).filter(Document.ps930IdArchive.in_(ids), Document.folio_total.is_(None)).count(),
        }
    except Exception:
        logger.exception("kardex summary failed")
        db.rollback()
        return fallback


@router.get("/timeline")
def timeline(
    request: Request,
    archive_id: int | None = None,
    entity_type: str | None = None,
    movement_type: str | None = None,
    status: str | None = None,
    user_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    transfer_id: int | None = None,
    expedient_id: int | None = None,
    folder_id: int | None = None,
    box_id: int | None = None,
    loan_id: int | None = None,
    rejection_reason: str | None = None,
    evidence: str | None = Query(default=None, pattern="^(with|without)$"),
    skip: int = 0,
    limit: int = 100,
    user: User = Depends(require_permission("document.read")),
    db: Session = Depends(get_db),
):
    if archive_id:
        _require_archive_access(db, user, archive_id)
    query = _apply_filters(_base_query(db, user), archive_id=archive_id, entity_type=entity_type, movement_type=movement_type, status=status, user_id=user_id, date_from=date_from, date_to=date_to, transfer_id=transfer_id, expedient_id=expedient_id, folder_id=folder_id, box_id=box_id, loan_id=loan_id, rejection_reason=rejection_reason, evidence=evidence)
    rows = query.order_by(KardexMovement.created_at.desc()).offset(skip).limit(min(limit, 250)).all()
    write_audit(db, action="kardex_timeline_viewed", module="kardex", user_id=user.identification, entity="kardex", new_values={"archive_id": archive_id, "entity_type": entity_type, "movement_type": movement_type, "status": status}, request=request)
    db.commit()
    return [_movement_to_dict(item) for item in rows]


@router.get("/entities/{entity_type}/{entity_id}/timeline")
def entity_timeline(entity_type: str, entity_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    conditions = [and_(KardexMovement.entity_type == entity_type, KardexMovement.entity_id == entity_id)]
    related_columns = {
        "document": KardexMovement.related_document_id,
        "folder": KardexMovement.related_folder_id,
        "expedient": KardexMovement.related_expedient_id,
        "box": KardexMovement.related_box_id,
        "transfer": KardexMovement.related_transfer_id,
        "loan": KardexMovement.related_loan_id,
    }
    if entity_type in related_columns:
        conditions.append(related_columns[entity_type] == entity_id)
    query = _base_query(db, user).filter(or_(*conditions))
    rows = query.order_by(KardexMovement.created_at.asc()).limit(250).all()
    if not rows:
        return []
    return [_movement_to_dict(item) for item in rows]


@router.get("/entities/{entity_type}/{entity_id}/trace")
def entity_trace(entity_type: str, entity_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    rows = entity_timeline(entity_type, entity_id, user, db)
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "current_archive_id": rows[-1]["destination_archive_id"] or rows[-1]["origin_archive_id"] if rows else None,
        "current_status": rows[-1]["new_status"] if rows else None,
        "events": rows,
    }


@router.get("/archive/{archive_id}/balance")
def archive_balance(archive_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    _require_archive_access(db, user, archive_id)
    return {
        "archive_id": archive_id,
        "documents": db.query(Document).filter(Document.ps930IdArchive == archive_id).count(),
        "folders": db.query(Folder).filter(Folder.ps930IdArchive == archive_id).count(),
        "expedients": db.query(Expedient).filter(Expedient.ps930IdArchive == archive_id).count(),
        "boxes": db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive == archive_id).count(),
        "active_loans": db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive == archive_id, DocumentLoan.status == "active").count(),
        "transfers_in_transit": db.query(TransferBatch).filter(or_(TransferBatch.ps930OriginArchiveId == archive_id, TransferBatch.ps930DestinationArchiveId == archive_id), TransferBatch.status.in_(["packed", "shipped", "under_review"])).count(),
        "pending_reception_items": db.query(TransferBatchItem).filter(TransferBatchItem.ps930DestinationArchiveId == archive_id, TransferBatchItem.status.in_(["pending", "pending_review", "with_inconsistency"])).count(),
        "recent_rejected_items": db.query(TransferBatchItem).filter(or_(TransferBatchItem.ps930OriginArchiveId == archive_id, TransferBatchItem.ps930DestinationArchiveId == archive_id), TransferBatchItem.status == "rejected").count(),
    }


@router.get("/export")
def export_kardex(
    request: Request,
    archive_id: int | None = None,
    entity_type: str | None = None,
    movement_type: str | None = None,
    status: str | None = None,
    user_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user: User = Depends(require_permission("document.read")),
    db: Session = Depends(get_db),
):
    if archive_id:
        _require_archive_access(db, user, archive_id)
    rows = _apply_filters(_base_query(db, user), archive_id=archive_id, entity_type=entity_type, movement_type=movement_type, status=status, user_id=user_id, date_from=date_from, date_to=date_to, transfer_id=None, expedient_id=None, folder_id=None, box_id=None, loan_id=None, rejection_reason=None, evidence=None).order_by(KardexMovement.created_at.desc()).limit(1000).all()
    lines = ["movement_code,event_type,entity_type,entity_id,origin_archive_id,destination_archive_id,status,action_by,created_at,rejection_reason,observation"]
    for item in rows:
        lines.append(",".join([
            item.movement_code or f"KDX-{item.idMovement:08d}",
            item.movement_type,
            item.entity_type,
            str(item.entity_id),
            str(item.ps930OriginArchiveId or ""),
            str(item.ps930DestinationArchiveId or ""),
            item.status,
            item.ps405ActorIdentification,
            item.created_at.isoformat() if item.created_at else "",
            (item.reason or "").replace(",", " "),
            (item.observations or "").replace(",", " "),
        ]))
    write_audit(db, action="kardex_exported", module="kardex", user_id=user.identification, entity="kardex", new_values={"archive_id": archive_id, "entity_type": entity_type, "movement_type": movement_type, "status": status, "date_from": date_from.isoformat() if date_from else None, "date_to": date_to.isoformat() if date_to else None}, request=request)
    db.commit()
    return Response("\n".join(lines), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=ambar-kardex.csv"})
