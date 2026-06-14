from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_any_permission, require_permission
from app.db.models import Document, DocumentTransfer, Location, Notification, TransferLog, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event

router = APIRouter(prefix="/transfers", tags=["transfers"])

VALID_TRANSITIONS = {
    "pending": {"approved", "rejected"},
    "approved": {"in_transit", "rejected"},
    "in_transit": {"received", "rejected"},
    "received": set(),
    "rejected": set(),
}


class LocationCreate(BaseModel):
    location_name: str = Field(min_length=3, max_length=160)
    address: str | None = None


class TransferCreate(BaseModel):
    document_id: int
    origin_location: int
    destination_location: int
    notes: str | None = None


class TransferStatusUpdate(BaseModel):
    status: str = Field(pattern="^(pending|approved|in_transit|received|rejected)$")
    notes: str | None = None


@router.get("/locations")
def list_locations(db: Session = Depends(get_db), user: User = Depends(require_permission("document.read"))):
    # Filtrar ubicaciones por empresa del usuario (previene IDOR cross-company)
    return db.query(Location).filter(Location.company_id == user.company_id).order_by(Location.location_name.asc()).all()


@router.post("/locations", status_code=status.HTTP_201_CREATED)
def create_location(
    payload: LocationCreate,
    request: Request,
    user: User = Depends(require_any_permission("archive.manage", "transfer.manage")),
    db: Session = Depends(get_db),
):
    location_name = payload.location_name.strip()
    existing = (
        db.query(Location)
        .filter(Location.company_id == user.company_id, Location.location_name == location_name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Location already exists")
    item = Location(location_name=location_name, address=payload.address, company_id=user.company_id)
    db.add(item)
    db.flush()
    write_audit(
        db,
        action="location_created",
        event="create",
        module="transfers",
        user_id=user.identification,
        entity="location",
        entity_id=item.idLocation,
        auditable_type="Location",
        auditable_id=item.idLocation,
        new_values=payload.model_dump(),
        tags=["logistica"],
        request=request,
    )
    db.commit()
    db.refresh(item)
    return item


@router.get("")
def list_transfers(db: Session = Depends(get_db), user: User = Depends(require_permission("document.read"))):
    # JOIN con Document para filtrar por company_id del usuario (previene IDOR cross-company)
    return (
        db.query(DocumentTransfer)
        .join(Document, Document.idDocument == DocumentTransfer.ps520IdDocument)
        .filter(Document.company_id == user.company_id)
        .order_by(DocumentTransfer.transfer_date.desc())
        .all()
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_transfer(
    payload: TransferCreate,
    request: Request,
    user: User = Depends(require_permission("document.transfer")),
    db: Session = Depends(get_db),
):
    document = db.get(Document, payload.document_id)
    if not document or document.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    # Verificar que las ubicaciones pertenezcan a la empresa del usuario
    origin = db.query(Location).filter(Location.idLocation == payload.origin_location, Location.company_id == user.company_id).one_or_none()
    destination = db.query(Location).filter(Location.idLocation == payload.destination_location, Location.company_id == user.company_id).one_or_none()
    if not origin or not destination:
        raise HTTPException(status_code=422, detail="Invalid location")
    transfer = DocumentTransfer(
        ps520IdDocument=payload.document_id,
        origin_location=payload.origin_location,
        destination_location=payload.destination_location,
        ps405Identification=user.identification,
        status="pending",
    )
    db.add(transfer)
    db.flush()
    db.add(TransferLog(ps702IdTransfer=transfer.idTransfer, action="pending", ps405Identification=user.identification, notes=payload.notes))
    db.add(Notification(ps405Identification=user.identification, message=f"Transferencia pendiente para {document.document_name}", type="in_app", action_url=f"/kardex?transfer={transfer.idTransfer}"))
    write_audit(
        db,
        action="transfer_created",
        event="create",
        module="transfers",
        user_id=user.identification,
        entity="transfer",
        entity_id=transfer.idTransfer,
        auditable_type="DocumentTransfer",
        auditable_id=transfer.idTransfer,
        new_values=payload.model_dump(),
        tags=["logistica", "documental"],
        request=request,
    )
    db.commit()
    publish_event("transfer.created", {"transfer_id": transfer.idTransfer, "document_id": document.idDocument})
    db.refresh(transfer)
    return transfer


@router.patch("/{transfer_id}/status")
def update_transfer_status(
    transfer_id: int,
    payload: TransferStatusUpdate,
    request: Request,
    user: User = Depends(require_permission("transfer.manage")),
    db: Session = Depends(get_db),
):
    # Verificar que la transferencia pertenece a un documento de la empresa del usuario
    transfer = (
        db.query(DocumentTransfer)
        .join(Document, Document.idDocument == DocumentTransfer.ps520IdDocument)
        .filter(DocumentTransfer.idTransfer == transfer_id, Document.company_id == user.company_id)
        .one_or_none()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if payload.status not in VALID_TRANSITIONS.get(transfer.status, set()):
        raise HTTPException(status_code=409, detail="Invalid transfer transition")
    old_status = transfer.status
    transfer.status = payload.status
    if payload.status == "received":
        document = db.get(Document, transfer.ps520IdDocument)
        if document:
            document.location_id = transfer.destination_location
            document.status = "custody"
    db.add(TransferLog(ps702IdTransfer=transfer.idTransfer, action=payload.status, ps405Identification=user.identification, notes=payload.notes))
    write_audit(
        db,
        action="transfer_status_updated",
        event="update",
        module="transfers",
        user_id=user.identification,
        entity="transfer",
        entity_id=transfer.idTransfer,
        auditable_type="DocumentTransfer",
        auditable_id=transfer.idTransfer,
        old_values={"status": old_status},
        new_values=payload.model_dump(),
        tags=["logistica"],
        request=request,
    )
    db.commit()
    publish_event("transfer.status_updated", {"transfer_id": transfer.idTransfer, "status": payload.status})
    db.refresh(transfer)
    return transfer


@router.get("/{transfer_id}/log")
def transfer_log(transfer_id: int, db: Session = Depends(get_db), user: User = Depends(require_permission("document.read"))):
    # Verificar acceso a la transferencia por empresa
    transfer = (
        db.query(DocumentTransfer)
        .join(Document, Document.idDocument == DocumentTransfer.ps520IdDocument)
        .filter(DocumentTransfer.idTransfer == transfer_id, Document.company_id == user.company_id)
        .one_or_none()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return db.query(TransferLog).filter(TransferLog.ps702IdTransfer == transfer_id).order_by(TransferLog.action_date.asc()).all()
