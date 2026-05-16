from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AdvancedNotification, Document, Location, NotificationDeliveryLog, TransferBatch, TransferBatchDocument, TransferEvidence, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event
from app.services.storage import store_file

router = APIRouter(prefix="/transfer-batches", tags=["transfer-batches"])

TRANSITIONS = {
    "pending": {"approved", "rejected"},
    "approved": {"packed", "rejected"},
    "packed": {"shipped", "rejected"},
    "shipped": {"partially_received", "received", "rejected"},
    "partially_received": {"received", "closed", "rejected"},
    "received": {"closed"},
    "rejected": set(),
    "closed": set(),
}


class BatchCreate(BaseModel):
    batch_code: str = Field(min_length=3, max_length=60)
    origin_location: int
    destination_location: int


class BatchDocumentCreate(BaseModel):
    document_id: int


class BatchStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|approved|packed|shipped|partially_received|received|rejected|closed)$")
    notes: str | None = None


@router.get("")
def list_batches(db: Session = Depends(get_db), _: User = Depends(require_permission("transfer.batch_manage"))):
    return db.query(TransferBatch).order_by(TransferBatch.created_at.desc()).all()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_batch(payload: BatchCreate, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    if not db.get(Location, payload.origin_location) or not db.get(Location, payload.destination_location):
        raise HTTPException(status_code=422, detail="Invalid location")
    batch = TransferBatch(**payload.model_dump(), status="pending")
    db.add(batch)
    db.flush()
    write_audit(db, action="transfer_batch_created", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch.idBatch, new_values=payload.model_dump(), request=request)
    db.commit()
    publish_event("transfer_batch.created", {"batch_id": batch.idBatch})
    db.refresh(batch)
    return batch


@router.post("/{batch_id}/documents", status_code=status.HTTP_201_CREATED)
def add_document(batch_id: int, payload: BatchDocumentCreate, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    document = db.get(Document, payload.document_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if not document or document.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    item = TransferBatchDocument(ps1070IdBatch=batch_id, ps520IdDocument=payload.document_id, status="pending")
    db.add(item)
    db.flush()
    write_audit(db, action="transfer_batch_document_added", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch_id, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/{batch_id}/documents")
def list_batch_documents(batch_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("transfer.batch_manage"))):
    return db.query(TransferBatchDocument).filter(TransferBatchDocument.ps1070IdBatch == batch_id).all()


@router.patch("/{batch_id}/status")
def update_batch_status(batch_id: int, payload: BatchStatusUpdate, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if payload.status not in TRANSITIONS.get(batch.status, set()):
        raise HTTPException(status_code=409, detail="Invalid batch transition")
    old_status = batch.status
    batch.status = payload.status
    if payload.status in {"received", "closed"}:
        for item in db.query(TransferBatchDocument).filter(TransferBatchDocument.ps1070IdBatch == batch_id).all():
            item.status = "received"
            document = db.get(Document, item.ps520IdDocument)
            if document:
                document.location_id = batch.destination_location
                document.status = "custody"
    note = AdvancedNotification(ps405Identification=user.identification, module="transfers", message=f"Lote {batch.batch_code} actualizado a {payload.status}", action_url=f"/transfer-batches?batch={batch.idBatch}", status="pending")
    db.add(note)
    db.flush()
    db.add(NotificationDeliveryLog(ps1040IdNotification=note.idNotification, delivery_channel="in_app", delivery_status="stored"))
    write_audit(db, action="transfer_batch_status_updated", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch_id, old_values={"status": old_status}, new_values=payload.model_dump(), request=request)
    db.commit()
    publish_event("transfer.received" if payload.status == "received" else "transfer_batch.status_updated", {"batch_id": batch_id, "status": payload.status})
    db.refresh(batch)
    return batch


@router.post("/{batch_id}/evidences", status_code=status.HTTP_201_CREATED)
async def add_evidence(batch_id: int, request: Request, evidence_type: str, notes: str | None = None, file: UploadFile = File(...), user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    if not db.get(TransferBatch, batch_id):
        raise HTTPException(status_code=404, detail="Batch not found")
    content = await file.read()
    try:
        stored = store_file(company_id=user.company_id, module="transfer-evidences", file=file, content=content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    evidence = TransferEvidence(ps1070IdBatch=batch_id, evidence_type=evidence_type, file_path=stored["path"], notes=notes)
    db.add(evidence)
    db.flush()
    write_audit(db, action="transfer_evidence_added", module="transfers", user_id=user.identification, entity="transfer_batch", entity_id=batch_id, new_values={"evidence_type": evidence_type, "checksum": stored["checksum"]}, request=request)
    db.commit()
    db.refresh(evidence)
    return evidence
