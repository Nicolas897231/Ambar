from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import AdvancedNotification, Archive, ArchiveUser, DocumentLoan, Expedient, Folder, InventoryFuid, Notification, TransferBatchItem, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.operational import create_operational_task, notify_action

router = APIRouter(prefix="/notifications", tags=["notifications"])


ACTIVE_STATUSES = {"pending", "unread", "read", "action_required"}


def _is_global(user: User, db: Session) -> bool:
    permissions = user_permissions(db, user)
    return "*" in permissions or "archive.manage" in permissions


def _allowed_archive_ids(db: Session, user: User) -> list[int]:
    if _is_global(user, db):
        return [row.idArchive for row in db.query(Archive.idArchive).all()]
    return [row.ps930IdArchive for row in db.query(ArchiveUser).filter(ArchiveUser.ps405Identification == user.identification).all()]


def _notification_to_dict(db: Session, item: AdvancedNotification) -> dict:
    archive = db.get(Archive, item.ps930IdArchive) if item.ps930IdArchive else None
    status = "unread" if item.status == "pending" else item.status
    return {
        "idNotification": item.idNotification,
        "user_id": item.ps405Identification,
        "archive_id": item.ps930IdArchive,
        "archive_name": archive.archive_name if archive else None,
        "module": item.module,
        "title": item.title or item.message,
        "message": item.message,
        "priority": item.priority or "normal",
        "type": item.notification_type or "system_info",
        "status": status,
        "related_entity_type": item.related_entity_type,
        "related_entity_id": item.related_entity_id,
        "action_label": item.action_label or ("Abrir" if item.action_url else None),
        "action_url": item.action_url,
        "metadata": item.metadata_json or {},
        "read_at": item.read_at,
        "resolved_at": item.resolved_at,
        "dismissed_at": item.dismissed_at,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


def _legacy_to_dict(item: Notification) -> dict:
    return {
        "idNotification": item.idNotification,
        "user_id": item.ps405Identification,
        "archive_id": None,
        "archive_name": None,
        "module": item.type or "in_app",
        "title": item.message,
        "message": item.message,
        "priority": "normal",
        "type": item.type or "system_info",
        "status": "read" if item.read_status else "unread",
        "related_entity_type": None,
        "related_entity_id": None,
        "action_label": "Abrir" if item.action_url else None,
        "action_url": item.action_url,
        "metadata": {},
        "read_at": None,
        "resolved_at": None,
        "dismissed_at": None,
        "created_at": item.created_at,
        "updated_at": None,
    }


def _advanced_query(db: Session, user: User):
    ids = _allowed_archive_ids(db, user)
    return db.query(AdvancedNotification).filter(
        AdvancedNotification.ps405Identification == user.identification,
        or_(AdvancedNotification.ps930IdArchive.is_(None), AdvancedNotification.ps930IdArchive.in_(ids)),
    )


@router.get("")
def list_notifications(
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = None,
    archive_id: int | None = None,
    module: str | None = None,
    include_resolved: bool = False,
    user: User = Depends(require_permission("notification.read")),
    db: Session = Depends(get_db),
):
    query = _advanced_query(db, user)
    if not include_resolved:
        query = query.filter(AdvancedNotification.status.notin_(["resolved", "dismissed", "expired"]))
    if status_filter:
        query = query.filter(AdvancedNotification.status == ("pending" if status_filter == "unread" else status_filter))
    if priority:
        query = query.filter(AdvancedNotification.priority == priority)
    if archive_id:
        if archive_id not in _allowed_archive_ids(db, user):
            raise HTTPException(status_code=403, detail="Archive access denied")
        query = query.filter(AdvancedNotification.ps930IdArchive == archive_id)
    if module:
        query = query.filter(AdvancedNotification.module == module)
    advanced = [_notification_to_dict(db, item) for item in query.order_by(AdvancedNotification.created_at.desc()).limit(100).all()]
    legacy = [_legacy_to_dict(item) for item in db.query(Notification).filter(Notification.ps405Identification == user.identification).order_by(Notification.created_at.desc()).limit(25).all()] if not module and not archive_id and not priority else []
    return sorted([*advanced, *legacy], key=lambda item: item["created_at"] or datetime.min.replace(tzinfo=UTC), reverse=True)


@router.get("/summary")
def notifications_summary(user: User = Depends(require_permission("notification.read")), db: Session = Depends(get_db)):
    rows = [_notification_to_dict(db, item) for item in _advanced_query(db, user).all()]
    actionable = [item for item in rows if item["status"] in {"unread", "pending", "action_required", "read"}]
    return {
        "unread": sum(1 for item in actionable if item["status"] in {"unread", "pending", "action_required"}),
        "action_required": sum(1 for item in actionable if item["status"] == "action_required"),
        "critical": sum(1 for item in actionable if item["priority"] == "critical"),
        "resolved": sum(1 for item in rows if item["status"] == "resolved"),
        "by_module": {module: sum(1 for item in actionable if item["module"] == module) for module in sorted({item["module"] for item in actionable})},
    }


@router.post("/rebuild-operational-alerts")
def rebuild_operational_alerts(request: Request, user: User = Depends(require_permission("notification.read")), db: Session = Depends(get_db)):
    ids = _allowed_archive_ids(db, user)
    created = 0
    now = datetime.now(UTC)
    loans = db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive.in_(ids), DocumentLoan.status.in_(["due_today", "overdue"])).all()
    for loan in loans:
        priority = "critical" if loan.status == "overdue" else "high"
        title = f"Prestamo {'vencido' if loan.status == 'overdue' else 'vence hoy'}"
        notify_action(
            db,
            user_id=user.identification,
            archive_id=loan.ps930IdArchive,
            module="custody",
            title=title,
            message=f"{loan.entity_type} #{loan.entity_id} esta en prestamo {loan.status}.",
            priority=priority,
            notification_type="loan_overdue" if loan.status == "overdue" else "loan_due_today",
            related_entity_type="loan",
            related_entity_id=loan.idLoan,
            action_label="Resolver prestamo",
            action_url=f"/loans?loan={loan.idLoan}",
        )
        create_operational_task(db, assigned_to=user.identification, archive_id=loan.ps930IdArchive, module="custody", title=title, priority=priority, due_date=loan.due_at or now, related_entity_type="loan", related_entity_id=loan.idLoan, action_url=f"/loans?loan={loan.idLoan}", metadata={"message": "Registrar devolucion o justificar el prestamo."})
        created += 1
    transfer_items = db.query(TransferBatchItem).filter(
        or_(TransferBatchItem.ps930OriginArchiveId.in_(ids), TransferBatchItem.ps930DestinationArchiveId.in_(ids)),
        TransferBatchItem.status.in_(["rejected", "partially_received", "with_inconsistency", "pending_review"]),
    ).limit(50).all()
    for item in transfer_items:
        archive_id = item.ps930DestinationArchiveId or item.ps930OriginArchiveId
        is_pending = item.status == "pending_review"
        title = "Recepcion pendiente" if is_pending else "Recepcion con inconsistencias"
        notify_action(db, user_id=user.identification, archive_id=archive_id, module="transfers", title=title, message=f"{item.entity_type} #{item.entity_id} esta en estado {item.status}.", priority="high" if not is_pending else "normal", notification_type="reception_pending" if is_pending else "reception_rejected", related_entity_type="transfer_batch", related_entity_id=item.ps1070IdBatch, action_label="Abrir recepcion", action_url=f"/reception?batch={item.ps1070IdBatch}")
        create_operational_task(db, assigned_to=user.identification, archive_id=archive_id, module="transfers", title=title, priority="high" if not is_pending else "normal", related_entity_type="transfer_batch", related_entity_id=item.ps1070IdBatch, action_url=f"/reception?batch={item.ps1070IdBatch}", metadata={"message": "Revisar recepcion documental por item."})
        created += 1
    fuids = db.query(InventoryFuid).filter(InventoryFuid.ps930IdArchive.in_(ids)).limit(100).all()
    for fuid in fuids:
        metadata = fuid.metadata_json or {}
        items = metadata.get("items", [])
        inconsistent = [item for item in items if item.get("status") in {"rejected", "partially_received"} or item.get("inconsistencies")]
        if not inconsistent:
            continue
        notify_action(db, user_id=user.identification, archive_id=fuid.ps930IdArchive, module="fuid", title="FUID con inconsistencias", message=f"{fuid.fuid_code} tiene {len(inconsistent)} registros por revisar.", priority="high", notification_type="fuid_inconsistency", related_entity_type="fuid", related_entity_id=fuid.idFuid, action_label="Comparar FUID", action_url=f"/fuid?fuid={fuid.idFuid}")
        create_operational_task(db, assigned_to=user.identification, archive_id=fuid.ps930IdArchive, module="fuid", title="Corregir FUID con inconsistencias", priority="high", related_entity_type="fuid", related_entity_id=fuid.idFuid, action_url=f"/fuid?fuid={fuid.idFuid}", metadata={"message": "Comparar declarado contra recibido."})
        created += 1
    for expedient in db.query(Expedient).filter(Expedient.ps930IdArchive.in_(ids), Expedient.status.in_(["incomplete", "under_review"])).limit(50).all():
        folders = db.query(Folder).filter(Folder.ps950IdExpedient == expedient.idExpedient).count()
        if folders:
            continue
        notify_action(db, user_id=user.identification, archive_id=expedient.ps930IdArchive, module="archives", title="Expediente incompleto", message=f"{expedient.expedient_code} requiere carpeta/documentos antes de cierre.", priority="normal", notification_type="expedient_incomplete", related_entity_type="expedient", related_entity_id=expedient.idExpedient, action_label="Abrir expediente", action_url=f"/expedients?expedient={expedient.idExpedient}")
        create_operational_task(db, assigned_to=user.identification, archive_id=expedient.ps930IdArchive, module="archives", title="Completar expediente", priority="normal", related_entity_type="expedient", related_entity_id=expedient.idExpedient, action_url=f"/expedients?expedient={expedient.idExpedient}", metadata={"message": "Completar estructura documental del expediente."})
        created += 1
    write_audit(db, action="operational_alerts_rebuilt", module="notifications", user_id=user.identification, entity="notification", new_values={"created_or_updated": created}, request=request)
    db.commit()
    return {"created_or_updated": created}


@router.post("/{notification_id}/read")
@router.patch("/{notification_id}/read")
def mark_read(notification_id: int, request: Request, user: User = Depends(require_permission("notification.read")), db: Session = Depends(get_db)):
    item = db.get(AdvancedNotification, notification_id)
    if item:
        if item.ps405Identification != user.identification or (item.ps930IdArchive and item.ps930IdArchive not in _allowed_archive_ids(db, user)):
            raise HTTPException(status_code=404, detail="Notification not found")
        old_status = item.status
        item.status = "read"
        item.read_at = datetime.now(UTC)
        write_audit(db, action="notification_read", module="notifications", user_id=user.identification, entity="notification", entity_id=item.idNotification, old_values={"status": old_status}, new_values={"status": "read"}, request=request)
        db.commit()
        return _notification_to_dict(db, item)
    legacy = db.get(Notification, notification_id)
    if not legacy or legacy.ps405Identification != user.identification:
        raise HTTPException(status_code=404, detail="Notification not found")
    legacy.read_status = True
    write_audit(db, action="notification_read", module="notifications", user_id=user.identification, entity="notification", entity_id=legacy.idNotification, request=request)
    db.commit()
    return _legacy_to_dict(legacy)


@router.post("/{notification_id}/resolve")
def resolve_notification(notification_id: int, request: Request, user: User = Depends(require_permission("notification.read")), db: Session = Depends(get_db)):
    item = db.get(AdvancedNotification, notification_id)
    if not item or item.ps405Identification != user.identification or (item.ps930IdArchive and item.ps930IdArchive not in _allowed_archive_ids(db, user)):
        raise HTTPException(status_code=404, detail="Notification not found")
    old_status = item.status
    item.status = "resolved"
    item.resolved_at = datetime.now(UTC)
    write_audit(db, action="notification_resolved", module="notifications", user_id=user.identification, entity="notification", entity_id=item.idNotification, old_values={"status": old_status}, new_values={"status": "resolved"}, request=request)
    db.commit()
    return _notification_to_dict(db, item)


@router.post("/{notification_id}/dismiss")
def dismiss_notification(notification_id: int, request: Request, user: User = Depends(require_permission("notification.read")), db: Session = Depends(get_db)):
    item = db.get(AdvancedNotification, notification_id)
    if not item or item.ps405Identification != user.identification or (item.ps930IdArchive and item.ps930IdArchive not in _allowed_archive_ids(db, user)):
        raise HTTPException(status_code=404, detail="Notification not found")
    old_status = item.status
    item.status = "dismissed"
    item.dismissed_at = datetime.now(UTC)
    write_audit(db, action="notification_dismissed", module="notifications", user_id=user.identification, entity="notification", entity_id=item.idNotification, old_values={"status": old_status}, new_values={"status": "dismissed"}, request=request)
    db.commit()
    return _notification_to_dict(db, item)


@router.post("/read-all")
def read_all_notifications(request: Request, user: User = Depends(require_permission("notification.read")), db: Session = Depends(get_db)):
    rows = _advanced_query(db, user).filter(AdvancedNotification.status.in_(ACTIVE_STATUSES)).all()
    now = datetime.now(UTC)
    for item in rows:
        item.status = "read"
        item.read_at = now
    db.query(Notification).filter(Notification.ps405Identification == user.identification, Notification.read_status.is_(False)).update({"read_status": True})
    write_audit(db, action="notifications_read_all", module="notifications", user_id=user.identification, entity="notification", new_values={"count": len(rows)}, request=request)
    db.commit()
    return {"updated": len(rows)}


@router.get("/advanced")
def list_advanced_notifications(user: User = Depends(require_permission("notification.read")), db: Session = Depends(get_db)):
    return list_notifications(user=user, db=db)


@router.patch("/advanced/{notification_id}/read")
def mark_advanced_read(notification_id: int, request: Request, user: User = Depends(require_permission("notification.read")), db: Session = Depends(get_db)):
    return mark_read(notification_id, request, user, db)
