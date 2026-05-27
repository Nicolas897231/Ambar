from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import require_permission
from datetime import UTC, datetime

from app.db.models import (
    Archive,
    Document,
    DocumentLoan,
    Expedient,
    Folder,
    InventoryFuid,
    KardexMovement,
    Location,
    PhysicalBox,
    TransferBatch,
    TransferBatchDocument,
    TransferBatchItem,
    TransferEvidence,
    User,
)
from app.db.session import get_db
from app.domains.archives.router import _require_archive_access, allowed_archive_ids
from app.services.audit import write_audit
from app.services.events import publish_event
from app.services.operational import create_operational_task, notify_action, resolve_notifications, resolve_related_tasks
from app.services.storage import store_file

router = APIRouter(prefix="/transfer-batches", tags=["transfer-batches"])

TRANSITIONS = {
    "pending": {"approved", "rejected"},
    "approved": {"packed", "rejected"},
    "packed": {"shipped", "rejected"},
    "shipped": {"under_review", "partially_received", "received", "rejected"},
    "under_review": {"partially_received", "received", "rejected", "closed"},
    "partially_received": {"received", "closed", "rejected"},
    "received": {"closed"},
    "rejected": set(),
    "returned": set(),
    "closed": set(),
}

TERMINAL_ITEM_STATUSES = {"accepted", "rejected", "partially_received", "returned"}
PENDING_ITEM_STATUSES = {"pending", "pending_review", "with_inconsistency"}
ACTIVE_LOAN_STATUSES = {"active", "due_today", "overdue"}


class BatchCreate(BaseModel):
    batch_code: str = Field(min_length=3, max_length=60)
    origin_location: int | None = None
    destination_location: int | None = None
    origin_archive_id: int | None = None
    destination_archive_id: int | None = None


class BatchDocumentCreate(BaseModel):
    document_id: int


class BatchItemCreate(BaseModel):
    entity_type: str = Field(pattern="^(document|folder|expedient|box)$")
    entity_id: int


class BatchStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|approved|packed|shipped|under_review|partially_received|received|rejected|returned|closed)$")
    notes: str | None = None


class ReceptionItemDecision(BaseModel):
    observation: str | None = None
    rejection_reason: str | None = Field(default=None, pattern="^(missing_folios|incomplete_expedient|fuid_mismatch|damaged_physical_unit|wrong_box|wrong_folder|invalid_document|wrong_support|location_mismatch|other)$")
    received_quantity: int | None = Field(default=None, ge=0)
    received_folios: int | None = Field(default=None, ge=0)
    evidence_url: str | None = None


class ReceptionClose(BaseModel):
    observation: str | None = None


def _batch_to_dict(db: Session, batch: TransferBatch) -> dict:
    origin_archive = db.get(Archive, batch.ps930OriginArchiveId) if batch.ps930OriginArchiveId else None
    destination_archive = db.get(Archive, batch.ps930DestinationArchiveId) if batch.ps930DestinationArchiveId else None
    fuid = db.query(InventoryFuid).filter(InventoryFuid.ps1070IdBatch == batch.idBatch).order_by(InventoryFuid.created_at.desc()).first()
    return {
        "idBatch": batch.idBatch,
        "batch_code": batch.batch_code,
        "origin_location": batch.origin_location,
        "destination_location": batch.destination_location,
        "origin_archive_id": batch.ps930OriginArchiveId,
        "destination_archive_id": batch.ps930DestinationArchiveId,
        "origin_archive_name": origin_archive.archive_name if origin_archive else None,
        "destination_archive_name": destination_archive.archive_name if destination_archive else None,
        "fuid_id": fuid.idFuid if fuid else None,
        "fuid_code": fuid.fuid_code if fuid else None,
        "items_count": db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch.idBatch).count(),
        "status": batch.status,
        "created_at": batch.created_at,
    }


def _item_to_dict(item: TransferBatchItem) -> dict:
    return {
        "idBatchItem": item.idBatchItem,
        "batch_id": item.ps1070IdBatch,
        "entity_type": item.entity_type,
        "entity_id": item.entity_id,
        "expected_quantity": item.expected_quantity,
        "received_quantity": item.received_quantity,
        "expected_folios": item.expected_folios,
        "received_folios": item.received_folios,
        "folio_total": item.folio_total,
        "status": "pending_review" if item.status == "pending" else item.status,
        "rejection_reason": item.rejection_reason,
        "observation": item.observation,
        "evidence_url": item.evidence_url,
        "reviewed_by": item.reviewed_by,
        "reviewed_at": item.reviewed_at,
        "origin_archive_id": item.ps930OriginArchiveId,
        "destination_archive_id": item.ps930DestinationArchiveId,
        "metadata": item.metadata_json or {},
    }


def _location_from_archive(archive: Archive | None, fallback: int | None) -> int:
    return archive.ps700IdLocation if archive and archive.ps700IdLocation else fallback or 1


def _add_batch_kardex(db: Session, batch: TransferBatch, user: User, status: str, notes: str | None = None) -> None:
    db.add(
        KardexMovement(
            movement_type="transfer",
            entity_type="batch",
            entity_id=batch.idBatch,
            related_transfer_id=batch.idBatch,
            ps930OriginArchiveId=batch.ps930OriginArchiveId,
            ps930DestinationArchiveId=batch.ps930DestinationArchiveId,
            origin_location_id=batch.origin_location,
            destination_location_id=batch.destination_location,
            ps405ActorIdentification=user.identification,
            previous_status=batch.status if status != batch.status else None,
            status=status,
            observations=notes or f"Lote documental {batch.batch_code}: {status}",
            metadata_json={"batch_code": batch.batch_code, "legacy_origin_location": batch.origin_location, "legacy_destination_location": batch.destination_location},
        )
    )


def _related_fields(entity_type: str, entity_id: int) -> dict:
    return {
        "related_document_id": entity_id if entity_type == "document" else None,
        "related_folder_id": entity_id if entity_type == "folder" else None,
        "related_expedient_id": entity_id if entity_type == "expedient" else None,
        "related_box_id": entity_id if entity_type == "box" else None,
    }


def _add_reception_kardex(db: Session, batch: TransferBatch, item: TransferBatchItem, user: User, event: str, old_status: str, notes: str | None = None) -> None:
    movement = KardexMovement(
        movement_type=event,
        entity_type=item.entity_type,
        entity_id=item.entity_id,
        related_transfer_id=batch.idBatch,
        **_related_fields(item.entity_type, item.entity_id),
        ps930OriginArchiveId=batch.ps930OriginArchiveId,
        ps930DestinationArchiveId=batch.ps930DestinationArchiveId,
        origin_location_id=batch.origin_location,
        destination_location_id=batch.destination_location,
        ps405ActorIdentification=user.identification,
        previous_status=old_status,
        status=item.status,
        evidence_url=item.evidence_url,
        reason=item.rejection_reason,
        observations=notes or item.observation,
        metadata_json={
            "batch_id": batch.idBatch,
            "batch_code": batch.batch_code,
            "batch_item_id": item.idBatchItem,
            "old_status": old_status,
            "new_status": item.status,
            "expected_quantity": item.expected_quantity,
            "received_quantity": item.received_quantity,
            "expected_folios": item.expected_folios,
            "received_folios": item.received_folios,
            "evidence_url": item.evidence_url,
        },
    )
    db.add(movement)
    db.flush()
    if event == "reception.item.accepted" and item.entity_type in {"folder", "expedient", "box"}:
        for child_type, child_id in _child_entities(db, item.entity_type, item.entity_id):
            db.add(
                KardexMovement(
                    movement_type="custody.changed",
                    entity_type=child_type,
                    entity_id=child_id,
                    related_transfer_id=batch.idBatch,
                    **_related_fields(child_type, child_id),
                    ps930OriginArchiveId=batch.ps930OriginArchiveId,
                    ps930DestinationArchiveId=batch.ps930DestinationArchiveId,
                    origin_location_id=batch.origin_location,
                    destination_location_id=batch.destination_location,
                    ps405ActorIdentification=user.identification,
                    previous_status=old_status,
                    status="accepted",
                    observations=f"Trazabilidad en cascada desde {item.entity_type} #{item.entity_id}",
                    metadata_json={"parent_movement_id": movement.idMovement, "batch_id": batch.idBatch, "batch_item_id": item.idBatchItem},
                )
            )


def _notify_origin(db: Session, batch: TransferBatch, message: str) -> None:
    archive = db.get(Archive, batch.ps930OriginArchiveId) if batch.ps930OriginArchiveId else None
    if not archive or not archive.custodian_identification:
        return
    notify_action(
        db,
        user_id=archive.custodian_identification,
        archive_id=batch.ps930OriginArchiveId,
        module="transfers",
        title=message,
        message=message,
        priority="high",
        notification_type="reception_rejected" if "rechaz" in message.lower() else "reception_partially_received" if "parcial" in message.lower() else "reception_pending",
        related_entity_type="transfer_batch",
        related_entity_id=batch.idBatch,
        action_label="Abrir recepcion",
        action_url=f"/reception?batch={batch.idBatch}",
        metadata={"batch_code": batch.batch_code},
    )
    create_operational_task(
        db,
        assigned_to=archive.custodian_identification,
        archive_id=batch.ps930OriginArchiveId,
        module="transfers",
        title=message,
        priority="high",
        related_entity_type="transfer_batch",
        related_entity_id=batch.idBatch,
        action_url=f"/reception?batch={batch.idBatch}",
        metadata={"message": message, "batch_code": batch.batch_code},
    )


def _require_reception_access(db: Session, user: User, batch: TransferBatch, levels: set[str] | None = None) -> None:
    if batch.ps930DestinationArchiveId:
        _require_archive_access(db, user, batch.ps930DestinationArchiveId, levels)
        return
    if batch.ps930OriginArchiveId:
        _require_archive_access(db, user, batch.ps930OriginArchiveId, levels)


def _entity_context(db: Session, entity_type: str, entity_id: int) -> tuple[int, int, str]:
    if entity_type == "document":
        item = db.get(Document, entity_id)
        if not item:
            raise HTTPException(status_code=404, detail="Document not found")
        if not item.ps930IdArchive or not item.ps950IdExpedient or not item.ps952IdFolder:
            raise HTTPException(status_code=422, detail="Document requires archive, expedient and folder before transfer")
        return item.ps930IdArchive, item.folio_total or 0, item.document_name
    if entity_type == "folder":
        item = db.get(Folder, entity_id)
        if not item:
            raise HTTPException(status_code=404, detail="Folder not found")
        return item.ps930IdArchive, item.folio_count or 0, item.folder_name
    if entity_type == "expedient":
        item = db.get(Expedient, entity_id)
        if not item:
            raise HTTPException(status_code=404, detail="Expedient not found")
        return item.ps930IdArchive, item.folio_count or 0, item.expedient_name
    if entity_type == "box":
        item = db.get(PhysicalBox, entity_id)
        if not item:
            raise HTTPException(status_code=404, detail="Box not found")
        folder_folios = sum(row.folio_count or 0 for row in db.query(Folder).filter(Folder.ps936IdBox == item.idBox).all())
        return item.ps930IdArchive, folder_folios, item.box_name or item.box_code
    raise HTTPException(status_code=422, detail="Unsupported batch entity type")


def _move_entity_to_archive(db: Session, entity_type: str, entity_id: int, destination_archive_id: int, destination_location_id: int) -> None:
    if entity_type == "document":
        document = db.get(Document, entity_id)
        if document:
            document.location_id = destination_location_id
            document.ps930IdArchive = destination_archive_id
            document.status = "active"
    elif entity_type == "folder":
        folder = db.get(Folder, entity_id)
        if folder:
            folder.ps930IdArchive = destination_archive_id
            folder.status = "active"
            for document in db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).all():
                document.location_id = destination_location_id
                document.ps930IdArchive = destination_archive_id
                document.status = "active"
    elif entity_type == "expedient":
        expedient = db.get(Expedient, entity_id)
        if expedient:
            expedient.ps930IdArchive = destination_archive_id
            expedient.status = "active"
            for folder in db.query(Folder).filter(Folder.ps950IdExpedient == expedient.idExpedient).all():
                folder.ps930IdArchive = destination_archive_id
            for document in db.query(Document).filter(Document.ps950IdExpedient == expedient.idExpedient).all():
                document.location_id = destination_location_id
                document.ps930IdArchive = destination_archive_id
                document.status = "active"
    elif entity_type == "box":
        box = db.get(PhysicalBox, entity_id)
        if box:
            box.ps930IdArchive = destination_archive_id
            for folder in db.query(Folder).filter(Folder.ps936IdBox == box.idBox).all():
                _move_entity_to_archive(db, "folder", folder.idFolder, destination_archive_id, destination_location_id)


def _child_entities(db: Session, entity_type: str, entity_id: int) -> list[tuple[str, int]]:
    children: list[tuple[str, int]] = []
    if entity_type == "folder":
        children.extend(("document", row.idDocument) for row in db.query(Document).filter(Document.ps952IdFolder == entity_id).all())
    elif entity_type == "expedient":
        folders = db.query(Folder).filter(Folder.ps950IdExpedient == entity_id).all()
        children.extend(("folder", row.idFolder) for row in folders)
        children.extend(("document", row.idDocument) for row in db.query(Document).filter(Document.ps950IdExpedient == entity_id).all())
    elif entity_type == "box":
        folders = db.query(Folder).filter(Folder.ps936IdBox == entity_id).all()
        children.extend(("folder", row.idFolder) for row in folders)
        for folder in folders:
            children.extend(("document", row.idDocument) for row in db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).all())
    return children


def _loan_related_units(db: Session, entity_type: str, entity_id: int) -> set[tuple[str, int]]:
    units: set[tuple[str, int]] = {(entity_type, entity_id)}
    if entity_type == "document":
        document = db.get(Document, entity_id)
        if document:
            if document.ps952IdFolder:
                units.add(("folder", document.ps952IdFolder))
                folder = db.get(Folder, document.ps952IdFolder)
                if folder and folder.ps936IdBox:
                    units.add(("box", folder.ps936IdBox))
            if document.ps950IdExpedient:
                units.add(("expedient", document.ps950IdExpedient))
    elif entity_type == "folder":
        folder = db.get(Folder, entity_id)
        if folder:
            if folder.ps950IdExpedient:
                units.add(("expedient", folder.ps950IdExpedient))
            if folder.ps936IdBox:
                units.add(("box", folder.ps936IdBox))
            units.update(("document", row.idDocument) for row in db.query(Document).filter(Document.ps952IdFolder == entity_id).all())
    elif entity_type == "expedient":
        folders = db.query(Folder).filter(Folder.ps950IdExpedient == entity_id).all()
        units.update(("folder", row.idFolder) for row in folders)
        units.update(("document", row.idDocument) for row in db.query(Document).filter(Document.ps950IdExpedient == entity_id).all())
        units.update(("box", row.ps936IdBox) for row in folders if row.ps936IdBox)
    elif entity_type == "box":
        folders = db.query(Folder).filter(Folder.ps936IdBox == entity_id).all()
        units.update(("folder", row.idFolder) for row in folders)
        units.update(("expedient", row.ps950IdExpedient) for row in folders if row.ps950IdExpedient)
        for folder in folders:
            units.update(("document", row.idDocument) for row in db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).all())
    return units


def _active_loan_for_transfer_entity(db: Session, entity_type: str, entity_id: int) -> DocumentLoan | None:
    conditions = [(DocumentLoan.entity_type == unit_type) & (DocumentLoan.entity_id == unit_id) for unit_type, unit_id in _loan_related_units(db, entity_type, entity_id)]
    if not conditions:
        return None
    return db.query(DocumentLoan).filter(or_(*conditions), DocumentLoan.status.in_(ACTIVE_LOAN_STATUSES)).first()


def _ensure_batch_fuid(db: Session, batch: TransferBatch, user: User) -> InventoryFuid | None:
    if not batch.ps930OriginArchiveId:
        return None
    existing = db.query(InventoryFuid).filter(InventoryFuid.ps1070IdBatch == batch.idBatch).one_or_none()
    if existing:
        return existing
    items = db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch.idBatch).all()
    folio_total = sum(item.expected_folios or item.folio_total or 0 for item in items)
    code = f"FUID-{batch.batch_code}-{int(datetime.now(UTC).timestamp())}"
    records = []
    for order, row in enumerate(items, start=1):
        records.append({
            "order_number": order,
            "documentary_unit_type": row.entity_type,
            "documentary_unit_id": row.entity_id,
            "unit_code": f"{row.entity_type.upper()}-{row.entity_id}",
            "unit_title": (row.metadata_json or {}).get("name") or f"{row.entity_type} #{row.entity_id}",
            "support_type": "hybrid",
            "conservation_unit": "box" if row.entity_type == "box" else "folder",
            "total_folios_declared": row.expected_folios or row.folio_total or 0,
            "total_folios_received": row.received_folios,
            "quantity_declared": row.expected_quantity or 1,
            "quantity_received": row.received_quantity,
            "status": "under_review" if row.status in {"pending", "pending_review"} else row.status,
            "observations": row.observation,
            "inconsistencies": [row.rejection_reason] if row.rejection_reason else [],
        })
    item = InventoryFuid(
        fuid_code=code,
        ps930IdArchive=batch.ps930OriginArchiveId,
        ps1070IdBatch=batch.idBatch,
        support_type="hybrid",
        folio_total=folio_total,
        location_summary=f"Transferencia {batch.batch_code}: archivo {batch.ps930OriginArchiveId} -> {batch.ps930DestinationArchiveId or '-'}",
        observations="FUID generado automaticamente desde transferencia documental",
        metadata_json={
            "status": "generated",
            "version": 1,
            "source": "transfer",
            "batch_id": batch.idBatch,
            "batch_code": batch.batch_code,
            "archive_origin_id": batch.ps930OriginArchiveId,
            "archive_destination_id": batch.ps930DestinationArchiveId,
            "created_by": user.identification,
            "generated_at": datetime.now(UTC).isoformat(),
            "items": records,
            "versions": [],
            "evidences": {"delivery": [], "reception": []},
        },
    )
    db.add(item)
    db.flush()
    _add_batch_kardex(db, batch, user, "fuid_generated", f"FUID generado automaticamente: {code}")
    return item


def _sync_legacy_item(db: Session, batch_id: int, item: TransferBatchItem) -> None:
    if item.entity_type != "document":
        return
    legacy = db.query(TransferBatchDocument).filter(TransferBatchDocument.ps1070IdBatch == batch_id, TransferBatchDocument.ps520IdDocument == item.entity_id).one_or_none()
    if legacy:
        legacy.status = item.status


def _update_batch_fuid_reception(db: Session, batch: TransferBatch) -> None:
    fuid = db.query(InventoryFuid).filter(InventoryFuid.ps1070IdBatch == batch.idBatch).one_or_none()
    if not fuid:
        return
    items = db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch.idBatch).all()
    received_folios = sum(item.received_folios or 0 for item in items)
    metadata = dict(fuid.metadata_json or {})
    records = list(metadata.get("items", []))
    records_by_key = {(record.get("documentary_unit_type") or record.get("entity_type"), record.get("documentary_unit_id") or record.get("entity_id")): record for record in records}
    for item in items:
        key = (item.entity_type, item.entity_id)
        record = records_by_key.get(key)
        if not record:
            record = {
                "order_number": len(records) + 1,
                "documentary_unit_type": item.entity_type,
                "documentary_unit_id": item.entity_id,
                "unit_code": f"{item.entity_type.upper()}-{item.entity_id}",
                "unit_title": (item.metadata_json or {}).get("name") or f"{item.entity_type} #{item.entity_id}",
                "total_folios_declared": item.expected_folios or item.folio_total or 0,
                "quantity_declared": item.expected_quantity or 1,
            }
            records.append(record)
        record["status"] = item.status
        record["total_folios_received"] = item.received_folios
        record["quantity_received"] = item.received_quantity
        record["observations"] = item.observation
        record["inconsistencies"] = [item.rejection_reason] if item.rejection_reason else ([] if item.status == "accepted" else record.get("inconsistencies", []))
    metadata["items"] = records
    metadata["status"] = "accepted" if items and all(item.status == "accepted" for item in items) else ("rejected" if items and all(item.status == "rejected" for item in items) else ("partially_received" if any(item.status in {"partially_received", "rejected", "accepted"} for item in items) else metadata.get("status", "generated")))
    metadata["reception"] = {
        "received_folios": received_folios,
        "items": [
            {
                "entity_type": item.entity_type,
                "entity_id": item.entity_id,
                "status": item.status,
                "expected_folios": item.expected_folios,
                "received_folios": item.received_folios,
                "rejection_reason": item.rejection_reason,
            }
            for item in items
        ],
    }
    fuid.metadata_json = metadata
    flag_modified(fuid, "metadata_json")
    fuid.observations = "FUID actualizado durante recepcion documental"


def _recalculate_batch_status(db: Session, batch: TransferBatch) -> str:
    items = db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch.idBatch).all()
    if not items:
        return batch.status
    statuses = {("pending_review" if item.status == "pending" else item.status) for item in items}
    if statuses <= {"accepted"}:
        batch.status = "received"
    elif statuses <= {"rejected"}:
        batch.status = "rejected"
    elif statuses & PENDING_ITEM_STATUSES:
        batch.status = "under_review"
    elif statuses <= TERMINAL_ITEM_STATUSES and len(statuses) > 1:
        batch.status = "partially_received"
    elif "partially_received" in statuses:
        batch.status = "partially_received"
    return batch.status


@router.get("")
def list_batches(db: Session = Depends(get_db), user: User = Depends(require_permission("transfer.batch_manage"))):
    ids = allowed_archive_ids(db, user)
    if not ids:
        return []
    query = db.query(TransferBatch)
    query = query.filter((TransferBatch.ps930OriginArchiveId.in_(ids)) | (TransferBatch.ps930DestinationArchiveId.in_(ids)))
    return [_batch_to_dict(db, item) for item in query.order_by(TransferBatch.created_at.desc()).all()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_batch(payload: BatchCreate, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    origin_archive = db.get(Archive, payload.origin_archive_id) if payload.origin_archive_id else None
    destination_archive = db.get(Archive, payload.destination_archive_id) if payload.destination_archive_id else None
    if payload.origin_archive_id:
        origin_archive = _require_archive_access(db, user, payload.origin_archive_id, {"operate", "admin"})
    if payload.destination_archive_id:
        destination_archive = _require_archive_access(db, user, payload.destination_archive_id)
    origin_location = payload.origin_location or _location_from_archive(origin_archive, user.location_id)
    destination_location = payload.destination_location or _location_from_archive(destination_archive, user.location_id)
    if not db.get(Location, origin_location) or not db.get(Location, destination_location):
        raise HTTPException(status_code=422, detail="Invalid location")
    if not origin_archive and not destination_archive and (payload.origin_location is None or payload.destination_location is None):
        raise HTTPException(status_code=422, detail="Batch requires archives or legacy locations")
    batch = TransferBatch(
        batch_code=payload.batch_code,
        origin_location=origin_location,
        destination_location=destination_location,
        ps930OriginArchiveId=origin_archive.idArchive if origin_archive else None,
        ps930DestinationArchiveId=destination_archive.idArchive if destination_archive else None,
        status="pending",
    )
    db.add(batch)
    db.flush()
    _add_batch_kardex(db, batch, user, "pending", "Lote documental creado")
    write_audit(db, action="transfer_batch_created", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch.idBatch, new_values=payload.model_dump(), request=request)
    db.commit()
    publish_event("transfer_batch.created", {"batch_id": batch.idBatch})
    db.refresh(batch)
    return _batch_to_dict(db, batch)


@router.post("/{batch_id}/documents", status_code=status.HTTP_201_CREATED)
def add_document(batch_id: int, payload: BatchDocumentCreate, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    document = db.get(Document, payload.document_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not document or document.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    if batch.ps930OriginArchiveId:
        _require_archive_access(db, user, batch.ps930OriginArchiveId, {"operate", "admin"})
        if document.ps930IdArchive != batch.ps930OriginArchiveId:
            raise HTTPException(status_code=422, detail="Document does not belong to transfer origin archive")
    if not document.ps930IdArchive or not document.ps950IdExpedient or not document.ps952IdFolder:
        raise HTTPException(status_code=422, detail="Document requires archive, expedient and folder before transfer")
    item = TransferBatchDocument(ps1070IdBatch=batch_id, ps520IdDocument=payload.document_id, status="pending")
    db.add(item)
    db.flush()
    if not db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id, TransferBatchItem.entity_type == "document", TransferBatchItem.entity_id == payload.document_id).one_or_none():
        db.add(
            TransferBatchItem(
                ps1070IdBatch=batch_id,
                entity_type="document",
                entity_id=payload.document_id,
                status="pending_review",
                expected_quantity=1,
                expected_folios=document.folio_total or 0,
                folio_total=document.folio_total or 0,
                ps930OriginArchiveId=batch.ps930OriginArchiveId,
                ps930DestinationArchiveId=batch.ps930DestinationArchiveId,
                metadata_json={"name": document.document_name},
            )
        )
    _add_batch_kardex(db, batch, user, "pending_validation", f"Documento #{document.idDocument} agregado al lote {batch.batch_code}")
    write_audit(db, action="transfer_batch_document_added", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch_id, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{batch_id}/documents")
def list_batch_documents(batch_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("transfer.batch_manage"))):
    return db.query(TransferBatchDocument).filter(TransferBatchDocument.ps1070IdBatch == batch_id).all()


@router.post("/{batch_id}/items", status_code=status.HTTP_201_CREATED)
def add_item(batch_id: int, payload: BatchItemCreate, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.ps930OriginArchiveId:
        _require_archive_access(db, user, batch.ps930OriginArchiveId, {"operate", "admin"})
    entity_archive_id, folio_total, name = _entity_context(db, payload.entity_type, payload.entity_id)
    if batch.ps930OriginArchiveId and entity_archive_id != batch.ps930OriginArchiveId:
        raise HTTPException(status_code=422, detail="Entity does not belong to transfer origin archive")
    active_loan = _active_loan_for_transfer_entity(db, payload.entity_type, payload.entity_id)
    if active_loan:
        raise HTTPException(status_code=409, detail="Documentary unit cannot be transferred because it has an active loan")
    existing = db.query(TransferBatchItem).filter(
        TransferBatchItem.ps1070IdBatch == batch_id,
        TransferBatchItem.entity_type == payload.entity_type,
        TransferBatchItem.entity_id == payload.entity_id,
    ).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Entity already added to batch")
    item = TransferBatchItem(
        ps1070IdBatch=batch_id,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        status="pending_review",
        expected_quantity=1,
        expected_folios=folio_total,
        folio_total=folio_total,
        ps930OriginArchiveId=batch.ps930OriginArchiveId,
        ps930DestinationArchiveId=batch.ps930DestinationArchiveId,
        metadata_json={"name": name},
    )
    db.add(item)
    db.flush()
    if payload.entity_type == "document" and not db.query(TransferBatchDocument).filter(TransferBatchDocument.ps1070IdBatch == batch_id, TransferBatchDocument.ps520IdDocument == payload.entity_id).one_or_none():
        db.add(TransferBatchDocument(ps1070IdBatch=batch_id, ps520IdDocument=payload.entity_id, status="pending"))
    _add_batch_kardex(db, batch, user, "pending_validation", f"{payload.entity_type} #{payload.entity_id} agregado al lote {batch.batch_code}")
    write_audit(db, action="transfer_batch_item_added", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch_id, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{batch_id}/items")
def list_batch_items(batch_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("transfer.batch_manage"))):
    return db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id).all()


def _reception_item(db: Session, batch_id: int, item_id: int) -> tuple[TransferBatch, TransferBatchItem]:
    batch = db.get(TransferBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    item = db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id, TransferBatchItem.idBatchItem == item_id).one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Reception item not found")
    return batch, item


@router.get("/{batch_id}/reception/items")
def list_reception_items(batch_id: int, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_reception_access(db, user, batch)
    return [_item_to_dict(item) for item in db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id).order_by(TransferBatchItem.idBatchItem.asc()).all()]


@router.get("/{batch_id}/reception/fuid-comparison")
def fuid_comparison(batch_id: int, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_reception_access(db, user, batch)
    fuid = _ensure_batch_fuid(db, batch, user)
    db.commit()
    db.refresh(batch)
    items = db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id).all()
    expected_folios = sum(item.expected_folios or item.folio_total or 0 for item in items)
    received_folios = sum(item.received_folios or 0 for item in items)
    expected_units = sum(item.expected_quantity or 1 for item in items)
    received_units = sum(item.received_quantity or 0 for item in items)
    return {
        "batch": _batch_to_dict(db, batch),
        "fuid": {"idFuid": fuid.idFuid, "fuid_code": fuid.fuid_code, "folio_total": fuid.folio_total} if fuid else None,
        "expected_units": expected_units,
        "received_units": received_units,
        "expected_folios": expected_folios,
        "received_folios": received_folios,
        "inconsistencies": [
            {
                "idBatchItem": item.idBatchItem,
                "entity_type": item.entity_type,
                "entity_id": item.entity_id,
                "status": item.status,
                "expected_folios": item.expected_folios,
                "received_folios": item.received_folios,
                "reason": item.rejection_reason or ("folios_mismatch" if (item.received_folios or 0) not in {0, item.expected_folios or item.folio_total or 0} else None),
            }
            for item in items
            if item.status in {"rejected", "partially_received", "with_inconsistency"} or ((item.received_folios or 0) not in {0, item.expected_folios or item.folio_total or 0})
        ],
    }


@router.post("/{batch_id}/reception/items/{item_id}/accept")
def accept_reception_item(batch_id: int, item_id: int, payload: ReceptionItemDecision, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch, item = _reception_item(db, batch_id, item_id)
    _require_reception_access(db, user, batch, {"operate", "admin"})
    old = _item_to_dict(item)
    old_status = item.status
    _ensure_batch_fuid(db, batch, user)
    item.status = "accepted"
    item.received_quantity = payload.received_quantity if payload.received_quantity is not None else item.expected_quantity or 1
    item.received_folios = payload.received_folios if payload.received_folios is not None else item.expected_folios or item.folio_total or 0
    item.observation = payload.observation
    item.evidence_url = payload.evidence_url
    item.reviewed_by = user.identification
    item.reviewed_at = datetime.now(UTC)
    if batch.ps930DestinationArchiveId:
        _move_entity_to_archive(db, item.entity_type, item.entity_id, batch.ps930DestinationArchiveId, batch.destination_location)
    _sync_legacy_item(db, batch_id, item)
    _update_batch_fuid_reception(db, batch)
    _recalculate_batch_status(db, batch)
    _add_reception_kardex(db, batch, item, user, "reception.item.accepted", old_status, payload.observation or "Unidad aceptada y custodia actualizada")
    write_audit(db, action="reception_item_accepted", module="transfers", user_id=user.identification, entity="transfer_batch_item", entity_id=item.idBatchItem, old_values=old, new_values=_item_to_dict(item), request=request)
    db.commit()
    db.refresh(item)
    return _item_to_dict(item)


@router.post("/{batch_id}/reception/items/{item_id}/reject")
def reject_reception_item(batch_id: int, item_id: int, payload: ReceptionItemDecision, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    if not payload.rejection_reason:
        raise HTTPException(status_code=422, detail="Rejection reason is required")
    batch, item = _reception_item(db, batch_id, item_id)
    _require_reception_access(db, user, batch, {"operate", "admin"})
    old = _item_to_dict(item)
    old_status = item.status
    _ensure_batch_fuid(db, batch, user)
    item.status = "rejected"
    item.rejection_reason = payload.rejection_reason
    item.observation = payload.observation
    item.evidence_url = payload.evidence_url
    item.reviewed_by = user.identification
    item.reviewed_at = datetime.now(UTC)
    _sync_legacy_item(db, batch_id, item)
    _update_batch_fuid_reception(db, batch)
    _recalculate_batch_status(db, batch)
    _add_reception_kardex(db, batch, item, user, "reception.item.rejected", old_status, payload.observation or payload.rejection_reason)
    _notify_origin(db, batch, f"Item rechazado en transferencia {batch.batch_code}: {item.entity_type} #{item.entity_id}")
    write_audit(db, action="reception_item_rejected", module="transfers", user_id=user.identification, entity="transfer_batch_item", entity_id=item.idBatchItem, old_values=old, new_values=_item_to_dict(item), request=request)
    db.commit()
    db.refresh(item)
    return _item_to_dict(item)


@router.post("/{batch_id}/reception/items/{item_id}/partial")
def partial_reception_item(batch_id: int, item_id: int, payload: ReceptionItemDecision, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    if not payload.observation:
        raise HTTPException(status_code=422, detail="Observation is required for partial reception")
    batch, item = _reception_item(db, batch_id, item_id)
    _require_reception_access(db, user, batch, {"operate", "admin"})
    old = _item_to_dict(item)
    old_status = item.status
    _ensure_batch_fuid(db, batch, user)
    item.status = "partially_received"
    item.received_quantity = payload.received_quantity if payload.received_quantity is not None else 0
    item.received_folios = payload.received_folios if payload.received_folios is not None else 0
    item.rejection_reason = payload.rejection_reason
    item.observation = payload.observation
    item.evidence_url = payload.evidence_url
    item.reviewed_by = user.identification
    item.reviewed_at = datetime.now(UTC)
    _sync_legacy_item(db, batch_id, item)
    _update_batch_fuid_reception(db, batch)
    _recalculate_batch_status(db, batch)
    _add_reception_kardex(db, batch, item, user, "reception.item.partially_received", old_status, payload.observation)
    _notify_origin(db, batch, f"Recepcion parcial en transferencia {batch.batch_code}: {item.entity_type} #{item.entity_id}")
    write_audit(db, action="reception_item_partially_received", module="transfers", user_id=user.identification, entity="transfer_batch_item", entity_id=item.idBatchItem, old_values=old, new_values=_item_to_dict(item), request=request)
    db.commit()
    db.refresh(item)
    return _item_to_dict(item)


@router.post("/{batch_id}/reception/close")
def close_reception(batch_id: int, payload: ReceptionClose, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    _require_reception_access(db, user, batch, {"operate", "admin"})
    items = db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id).all()
    if not items:
        raise HTTPException(status_code=422, detail="Reception has no items")
    pending = [item for item in items if ("pending_review" if item.status == "pending" else item.status) in PENDING_ITEM_STATUSES]
    if pending:
        raise HTTPException(status_code=409, detail="Reception has pending items")
    if not _ensure_batch_fuid(db, batch, user):
        raise HTTPException(status_code=422, detail="Reception cannot close without FUID")
    old_status = batch.status
    batch.status = "closed"
    _update_batch_fuid_reception(db, batch)
    _add_batch_kardex(db, batch, user, "reception.closed", payload.observation or "Recepcion cerrada")
    summary = {
        "accepted": sum(1 for item in items if item.status == "accepted"),
        "rejected": sum(1 for item in items if item.status == "rejected"),
        "partially_received": sum(1 for item in items if item.status == "partially_received"),
    }
    resolve_notifications(db, module="transfers", related_entity_type="transfer_batch", related_entity_id=batch.idBatch)
    resolve_related_tasks(db, related_entity_type="transfer_batch", related_entity_id=batch.idBatch, module="transfers", note="Recepcion cerrada.", completed_by=user.identification)
    _notify_origin(db, batch, f"Recepcion cerrada {batch.batch_code}: {summary['accepted']} aceptados, {summary['rejected']} rechazados, {summary['partially_received']} parciales")
    write_audit(db, action="reception_closed", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch.idBatch, old_values={"status": old_status}, new_values={"status": batch.status, "summary": summary}, request=request)
    db.commit()
    db.refresh(batch)
    return _batch_to_dict(db, batch)


@router.patch("/{batch_id}/status")
def update_batch_status(batch_id: int, payload: BatchStatusUpdate, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if payload.status not in TRANSITIONS.get(batch.status, set()):
        raise HTTPException(status_code=409, detail="Invalid batch transition")
    if batch.ps930OriginArchiveId:
        _require_archive_access(db, user, batch.ps930OriginArchiveId, {"operate", "admin"})
    if batch.ps930DestinationArchiveId and payload.status in {"partially_received", "received", "closed", "rejected"}:
        _require_archive_access(db, user, batch.ps930DestinationArchiveId, {"operate", "admin"})
    if payload.status == "rejected" and not payload.notes:
        raise HTTPException(status_code=422, detail="Rejection notes are required")
    old_status = batch.status
    batch.status = payload.status
    if payload.status in {"approved", "packed", "shipped", "received", "closed"}:
        _ensure_batch_fuid(db, batch, user)
    if payload.status in {"received", "closed"}:
        items = db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id).all()
        for item in items:
            item.status = "accepted"
            if batch.ps930DestinationArchiveId:
                _move_entity_to_archive(db, item.entity_type, item.entity_id, batch.ps930DestinationArchiveId, batch.destination_location)
        for document_item in db.query(TransferBatchDocument).filter(TransferBatchDocument.ps1070IdBatch == batch_id).all():
            document_item.status = "received"
    elif payload.status == "rejected":
        for item in db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id).all():
            item.status = "rejected"
        for item in db.query(TransferBatchDocument).filter(TransferBatchDocument.ps1070IdBatch == batch_id).all():
            item.status = "rejected"
    elif payload.status == "partially_received":
        for item in db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch_id).all():
            item.status = "partially_received"
        for item in db.query(TransferBatchDocument).filter(TransferBatchDocument.ps1070IdBatch == batch_id).all():
            item.status = "partially_received"
    _add_batch_kardex(db, batch, user, payload.status, payload.notes)
    notify_action(
        db,
        user_id=user.identification,
        archive_id=batch.ps930DestinationArchiveId or batch.ps930OriginArchiveId,
        module="transfers",
        title=f"Lote {batch.batch_code} actualizado",
        message=f"Transferencia {batch.batch_code} cambio a {payload.status}.",
        priority="high" if payload.status == "rejected" else "normal",
        notification_type="transfer_rejected" if payload.status == "rejected" else "transfer_pending",
        related_entity_type="transfer_batch",
        related_entity_id=batch.idBatch,
        action_label="Abrir transferencia",
        action_url=f"/transfer-batches?batch={batch.idBatch}",
    )
    write_audit(db, action="transfer_batch_status_updated", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch_id, old_values={"status": old_status}, new_values=payload.model_dump(), request=request)
    db.commit()
    publish_event("transfer.received" if payload.status == "received" else "transfer_batch.status_updated", {"batch_id": batch_id, "status": payload.status})
    db.refresh(batch)
    return _batch_to_dict(db, batch)


@router.post("/{batch_id}/evidences", status_code=status.HTTP_201_CREATED)
async def add_evidence(batch_id: int, request: Request, evidence_type: str, notes: str | None = None, file: UploadFile = File(...), user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.ps930OriginArchiveId:
        _require_archive_access(db, user, batch.ps930OriginArchiveId, {"operate", "admin"})
    content = await file.read()
    try:
        stored = store_file(company_id=user.company_id, module="transfer-evidences", file=file, content=content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    evidence = TransferEvidence(ps1070IdBatch=batch_id, evidence_type=evidence_type, file_path=stored["file_path"], notes=notes)
    db.add(evidence)
    db.flush()
    _add_batch_kardex(db, batch, user, "evidence_added", notes or f"Evidencia {evidence_type} agregada")
    write_audit(db, action="transfer_evidence_added", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch_id, new_values={"evidence_type": evidence_type, "checksum": stored["checksum"]}, request=request)
    db.commit()
    db.refresh(evidence)
    return evidence
