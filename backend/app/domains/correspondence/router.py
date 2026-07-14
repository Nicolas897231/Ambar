from datetime import UTC, datetime, timedelta
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import require_any_permission, require_permission
from app.db.models import (
    CorrespondenceEvent,
    CorrespondenceRecord,
    Document,
    Expedient,
    Notification,
    TrdDependency,
    User,
)
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.codes import generate_code

router = APIRouter(prefix="/correspondence", tags=["correspondence"])

OPEN_STATUSES = {"radicado", "asignado", "en_respuesta"}
CLOSED_STATUSES = {"respondido", "cerrado", "anulado"}
DIRECTIONS = {"inbound", "outbound"}
PRIORITIES = {"low", "normal", "high", "critical"}


def _blank_to_none(value):
    if isinstance(value, str):
        normalized = " ".join(value.strip().split())
        return normalized or None
    return value


def _now() -> datetime:
    return datetime.now(UTC)


class CorrespondenceCreate(BaseModel):
    sender_type: str | None = Field(default=None, max_length=40)
    sender_name: str | None = Field(default=None, max_length=180)
    sender_document: str | None = Field(default=None, max_length=60)
    sender_email: str | None = Field(default=None, max_length=255)
    sender_phone: str | None = Field(default=None, max_length=40)
    recipient_name: str | None = Field(default=None, max_length=180)
    recipient_document: str | None = Field(default=None, max_length=60)
    recipient_email: str | None = Field(default=None, max_length=255)
    subject: str = Field(min_length=4, max_length=240)
    description: str | None = Field(default=None, max_length=2000)
    communication_type: str = Field(default="carta", min_length=2, max_length=60)
    reception_channel: str | None = Field(default=None, max_length=60)
    dependency_id: int | None = None
    assigned_to: str | None = Field(default=None, max_length=40)
    expedient_id: int | None = None
    document_id: int | None = None
    priority: str = Field(default="normal")
    due_at: datetime | None = None
    metadata: dict = Field(default_factory=dict)

    @field_validator(
        "sender_type",
        "sender_name",
        "sender_document",
        "sender_email",
        "sender_phone",
        "recipient_name",
        "recipient_document",
        "recipient_email",
        "description",
        "reception_channel",
        "assigned_to",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value):
        return _blank_to_none(value)

    @field_validator("subject", "communication_type")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("sender_email", "recipient_email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Email invalido")
        return value.lower() if value else value

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in PRIORITIES:
            raise ValueError("Prioridad invalida")
        return normalized


class CorrespondenceAssign(BaseModel):
    assigned_to: str = Field(min_length=3, max_length=40)
    notes: str | None = Field(default=None, max_length=1000)
    due_at: datetime | None = None


class CorrespondenceResponse(BaseModel):
    notes: str = Field(min_length=3, max_length=2000)
    document_id: int | None = None


class CorrespondenceClose(BaseModel):
    notes: str | None = Field(default=None, max_length=1000)


def _record_base(record: CorrespondenceRecord) -> dict:
    is_overdue = bool(record.due_at and record.status not in CLOSED_STATUSES and record.due_at < _now())
    return {
        "id": record.idRecord,
        "radicado_code": record.radicado_code,
        "direction": record.direction,
        "subject": record.subject,
        "description": record.description,
        "communication_type": record.communication_type,
        "reception_channel": record.reception_channel,
        "sender_type": record.sender_type,
        "sender_name": record.sender_name,
        "sender_document": record.sender_document,
        "sender_email": record.sender_email,
        "sender_phone": record.sender_phone,
        "recipient_name": record.recipient_name,
        "recipient_document": record.recipient_document,
        "recipient_email": record.recipient_email,
        "dependency_id": record.ps608IdDependency,
        "dependency_name": record.dependency.name if record.dependency else None,
        "assigned_to": record.assigned_to,
        "assigned_to_name": record.assignee.name if record.assignee else None,
        "expedient_id": record.ps950IdExpedient,
        "expedient_code": record.expedient.expedient_code if record.expedient else None,
        "expedient_name": record.expedient.expedient_name if record.expedient else None,
        "document_id": record.ps520IdDocument,
        "document_name": record.document.document_name if record.document else None,
        "priority": record.priority,
        "status": "vencido" if is_overdue else record.status,
        "due_at": record.due_at,
        "responded_at": record.responded_at,
        "closed_at": record.closed_at,
        "created_by": record.created_by,
        "created_by_name": record.creator.name if record.creator else None,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "metadata": record.metadata_json or {},
        "is_overdue": is_overdue,
    }


def _event_out(event: CorrespondenceEvent) -> dict:
    return {
        "id": event.idEvent,
        "action": event.action,
        "user_id": event.ps405Identification,
        "user_name": event.user.name if event.user else None,
        "notes": event.notes,
        "old_values": event.old_values,
        "new_values": event.new_values,
        "created_at": event.created_at,
    }


def _get_record(db: Session, record_id: int, user: User) -> CorrespondenceRecord:
    record = (
        db.query(CorrespondenceRecord)
        .filter(CorrespondenceRecord.idRecord == record_id, CorrespondenceRecord.company_id == user.company_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Radicado no encontrado")
    return record


def _validate_references(db: Session, payload: CorrespondenceCreate, user: User) -> None:
    if payload.dependency_id and not db.get(TrdDependency, payload.dependency_id):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Dependencia no existe")
    if payload.assigned_to:
        assignee = db.get(User, payload.assigned_to)
        if not assignee or assignee.company_id != user.company_id or assignee.status != "active":
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Responsable no existe o no esta activo")
    if payload.expedient_id:
        expedient = db.get(Expedient, payload.expedient_id)
        if not expedient:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Expediente no existe")
    if payload.document_id:
        document = db.get(Document, payload.document_id)
        if not document or document.company_id != user.company_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Documento no existe")


def _add_event(
    db: Session,
    record: CorrespondenceRecord,
    action: str,
    user: User,
    *,
    notes: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
) -> None:
    db.add(
        CorrespondenceEvent(
            record=record,
            action=action,
            ps405Identification=user.identification,
            notes=notes,
            old_values=jsonable_encoder(old_values) if old_values is not None else None,
            new_values=jsonable_encoder(new_values) if new_values is not None else None,
        )
    )


def _notify_assignee(db: Session, record: CorrespondenceRecord) -> None:
    if not record.assigned_to:
        return
    db.add(
        Notification(
            ps405Identification=record.assigned_to,
            message=f"Radicado {record.radicado_code} requiere revision: {record.subject[:120]}",
            type="radicacion",
            action_url=f"#/correspondence/{record.idRecord}",
        )
    )


def _create_record(direction: str, payload: CorrespondenceCreate, request: Request, user: User, db: Session) -> dict:
    if direction not in DIRECTIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Direccion invalida")
    _validate_references(db, payload, user)
    if direction == "inbound" and not payload.sender_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Indica quien envia la comunicacion")
    if direction == "outbound" and not payload.recipient_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Indica destinatario de la comunicacion")

    code = generate_code(
        db,
        CorrespondenceRecord,
        "radicado_code",
        "ENT" if direction == "inbound" else "SAL",
        scope_filters=[CorrespondenceRecord.company_id == user.company_id],
    )
    record = CorrespondenceRecord(
        radicado_code=code,
        direction=direction,
        sender_type=payload.sender_type,
        sender_name=payload.sender_name,
        sender_document=payload.sender_document,
        sender_email=payload.sender_email,
        sender_phone=payload.sender_phone,
        recipient_name=payload.recipient_name,
        recipient_document=payload.recipient_document,
        recipient_email=payload.recipient_email,
        subject=payload.subject,
        description=payload.description,
        communication_type=payload.communication_type,
        reception_channel=payload.reception_channel,
        ps608IdDependency=payload.dependency_id,
        assigned_to=payload.assigned_to,
        ps950IdExpedient=payload.expedient_id,
        ps520IdDocument=payload.document_id,
        priority=payload.priority,
        status="asignado" if payload.assigned_to else "radicado",
        due_at=payload.due_at,
        created_by=user.identification,
        company_id=user.company_id,
        metadata_json=payload.metadata or {},
    )
    db.add(record)
    db.flush()
    _add_event(db, record, "radicado_creado", user, new_values=_record_base(record))
    if payload.assigned_to:
        _add_event(db, record, "radicado_asignado", user, new_values={"assigned_to": payload.assigned_to})
        _notify_assignee(db, record)
    write_audit(
        db,
        action="correspondence_created",
        event="create",
        module="correspondence",
        user_id=user.identification,
        entity="correspondence",
        entity_id=record.idRecord,
        entity_label=record.radicado_code,
        new_values=_record_base(record),
        request=request,
    )
    db.commit()
    db.refresh(record)
    return _record_base(record)


@router.get("")
def list_correspondence(
    q: str | None = None,
    direction: str | None = Query(default=None, pattern="^(inbound|outbound)$"),
    tray: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    user: User = Depends(require_any_permission("mail.view", "mail.manage")),
    db: Session = Depends(get_db),
):
    now = _now()
    query = db.query(CorrespondenceRecord).filter(CorrespondenceRecord.company_id == user.company_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                CorrespondenceRecord.radicado_code.like(like),
                CorrespondenceRecord.subject.like(like),
                CorrespondenceRecord.sender_name.like(like),
                CorrespondenceRecord.recipient_name.like(like),
                CorrespondenceRecord.sender_document.like(like),
            )
        )
    if direction:
        query = query.filter(CorrespondenceRecord.direction == direction)
    if status_filter:
        query = query.filter(CorrespondenceRecord.status == status_filter)
    if tray == "assigned":
        query = query.filter(CorrespondenceRecord.assigned_to == user.identification, CorrespondenceRecord.status.notin_(CLOSED_STATUSES))
    elif tray == "unassigned":
        query = query.filter(CorrespondenceRecord.assigned_to.is_(None), CorrespondenceRecord.status.notin_(CLOSED_STATUSES))
    elif tray == "overdue":
        query = query.filter(CorrespondenceRecord.due_at < now, CorrespondenceRecord.status.notin_(CLOSED_STATUSES))
    elif tray == "due_soon":
        query = query.filter(
            CorrespondenceRecord.due_at >= now,
            CorrespondenceRecord.due_at <= now + timedelta(days=3),
            CorrespondenceRecord.status.notin_(CLOSED_STATUSES),
        )
    elif tray == "closed":
        query = query.filter(CorrespondenceRecord.status.in_(CLOSED_STATUSES))

    total = query.count()
    items = (
        query.order_by(CorrespondenceRecord.created_at.desc(), CorrespondenceRecord.idRecord.desc())
        .offset((page - 1) * size)
        .limit(size)
        .all()
    )
    return {"items": [_record_base(item) for item in items], "total": total, "page": page, "size": size}


@router.get("/summary")
def correspondence_summary(
    user: User = Depends(require_any_permission("mail.view", "mail.manage")),
    db: Session = Depends(get_db),
):
    now = _now()
    base = db.query(CorrespondenceRecord).filter(CorrespondenceRecord.company_id == user.company_id)
    by_status = dict(
        base.with_entities(CorrespondenceRecord.status, func.count(CorrespondenceRecord.idRecord))
        .group_by(CorrespondenceRecord.status)
        .all()
    )
    return {
        "total": base.count(),
        "inbound": base.filter(CorrespondenceRecord.direction == "inbound").count(),
        "outbound": base.filter(CorrespondenceRecord.direction == "outbound").count(),
        "assigned_to_me": base.filter(CorrespondenceRecord.assigned_to == user.identification, CorrespondenceRecord.status.notin_(CLOSED_STATUSES)).count(),
        "unassigned": base.filter(CorrespondenceRecord.assigned_to.is_(None), CorrespondenceRecord.status.notin_(CLOSED_STATUSES)).count(),
        "overdue": base.filter(CorrespondenceRecord.due_at < now, CorrespondenceRecord.status.notin_(CLOSED_STATUSES)).count(),
        "due_soon": base.filter(
            CorrespondenceRecord.due_at >= now,
            CorrespondenceRecord.due_at <= now + timedelta(days=3),
            CorrespondenceRecord.status.notin_(CLOSED_STATUSES),
        ).count(),
        "by_status": by_status,
    }


@router.get("/{record_id}")
def get_correspondence(
    record_id: int,
    user: User = Depends(require_any_permission("mail.view", "mail.manage")),
    db: Session = Depends(get_db),
):
    record = _get_record(db, record_id, user)
    data = _record_base(record)
    data["events"] = [_event_out(event) for event in sorted(record.events, key=lambda item: item.created_at or _now())]
    return data


@router.post("/inbound", status_code=status.HTTP_201_CREATED)
def create_inbound(
    payload: CorrespondenceCreate,
    request: Request,
    user: User = Depends(require_permission("mail.manage")),
    db: Session = Depends(get_db),
):
    return _create_record("inbound", payload, request, user, db)


@router.post("/outbound", status_code=status.HTTP_201_CREATED)
def create_outbound(
    payload: CorrespondenceCreate,
    request: Request,
    user: User = Depends(require_permission("mail.manage")),
    db: Session = Depends(get_db),
):
    return _create_record("outbound", payload, request, user, db)


@router.post("/{record_id}/assign")
def assign_correspondence(
    record_id: int,
    payload: CorrespondenceAssign,
    request: Request,
    user: User = Depends(require_permission("mail.manage")),
    db: Session = Depends(get_db),
):
    record = _get_record(db, record_id, user)
    assignee = db.get(User, payload.assigned_to)
    if not assignee or assignee.company_id != user.company_id or assignee.status != "active":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Responsable no existe o no esta activo")
    old = {"assigned_to": record.assigned_to, "due_at": record.due_at, "status": record.status}
    record.assigned_to = payload.assigned_to
    record.due_at = payload.due_at or record.due_at
    if record.status == "radicado":
        record.status = "asignado"
    _add_event(db, record, "radicado_asignado", user, notes=payload.notes, old_values=old, new_values={"assigned_to": record.assigned_to, "due_at": record.due_at, "status": record.status})
    _notify_assignee(db, record)
    write_audit(
        db,
        action="correspondence_assigned",
        event="update",
        module="correspondence",
        user_id=user.identification,
        entity="correspondence",
        entity_id=record.idRecord,
        entity_label=record.radicado_code,
        old_values=old,
        new_values={"assigned_to": record.assigned_to, "due_at": record.due_at, "status": record.status},
        request=request,
    )
    db.commit()
    db.refresh(record)
    return _record_base(record)


@router.post("/{record_id}/respond")
def respond_correspondence(
    record_id: int,
    payload: CorrespondenceResponse,
    request: Request,
    user: User = Depends(require_permission("mail.manage")),
    db: Session = Depends(get_db),
):
    record = _get_record(db, record_id, user)
    if record.status in {"cerrado", "anulado"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El radicado ya esta cerrado o anulado")
    if payload.document_id:
        document = db.get(Document, payload.document_id)
        if not document or document.company_id != user.company_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Documento de respuesta no existe")
        record.ps520IdDocument = payload.document_id
    old = {"status": record.status, "document_id": record.ps520IdDocument}
    record.status = "respondido"
    record.responded_at = _now()
    _add_event(db, record, "radicado_respondido", user, notes=payload.notes, old_values=old, new_values={"status": record.status, "document_id": record.ps520IdDocument})
    write_audit(
        db,
        action="correspondence_responded",
        event="update",
        module="correspondence",
        user_id=user.identification,
        entity="correspondence",
        entity_id=record.idRecord,
        entity_label=record.radicado_code,
        old_values=old,
        new_values={"status": record.status, "document_id": record.ps520IdDocument},
        request=request,
    )
    db.commit()
    db.refresh(record)
    return _record_base(record)


@router.post("/{record_id}/close")
def close_correspondence(
    record_id: int,
    payload: CorrespondenceClose,
    request: Request,
    user: User = Depends(require_permission("mail.manage")),
    db: Session = Depends(get_db),
):
    record = _get_record(db, record_id, user)
    if record.status == "anulado":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El radicado esta anulado")
    old = {"status": record.status}
    record.status = "cerrado"
    record.closed_at = _now()
    _add_event(db, record, "radicado_cerrado", user, notes=payload.notes, old_values=old, new_values={"status": record.status})
    write_audit(
        db,
        action="correspondence_closed",
        event="update",
        module="correspondence",
        user_id=user.identification,
        entity="correspondence",
        entity_id=record.idRecord,
        entity_label=record.radicado_code,
        old_values=old,
        new_values={"status": record.status},
        request=request,
    )
    db.commit()
    db.refresh(record)
    return _record_base(record)


@router.post("/{record_id}/cancel")
def cancel_correspondence(
    record_id: int,
    payload: CorrespondenceClose,
    request: Request,
    user: User = Depends(require_permission("mail.manage")),
    db: Session = Depends(get_db),
):
    if not payload.notes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Indica motivo de anulacion")
    record = _get_record(db, record_id, user)
    old = {"status": record.status}
    record.status = "anulado"
    record.cancelled_at = _now()
    _add_event(db, record, "radicado_anulado", user, notes=payload.notes, old_values=old, new_values={"status": record.status})
    write_audit(
        db,
        action="correspondence_cancelled",
        event="update",
        module="correspondence",
        user_id=user.identification,
        entity="correspondence",
        entity_id=record.idRecord,
        entity_label=record.radicado_code,
        old_values=old,
        new_values={"status": record.status, "reason": payload.notes},
        request=request,
    )
    db.commit()
    db.refresh(record)
    return _record_base(record)
