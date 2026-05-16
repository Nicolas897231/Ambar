from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import Notification, User
from app.db.session import get_db
from app.services.audit import write_audit

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    user: User = Depends(require_permission("notification.read")),
    db: Session = Depends(get_db),
):
    return db.query(Notification).filter(Notification.ps405Identification == user.identification).order_by(Notification.created_at.desc()).all()


@router.patch("/{notification_id}/read")
def mark_read(
    notification_id: int,
    request: Request,
    user: User = Depends(require_permission("notification.read")),
    db: Session = Depends(get_db),
):
    item = db.get(Notification, notification_id)
    if not item or item.ps405Identification != user.identification:
        raise HTTPException(status_code=404, detail="Notification not found")
    item.read_status = True
    write_audit(db, action="notification_read", module="notifications", user_id=user.identification, entity="notification", entity_id=item.idNotification, request=request)
    db.commit()
    return item


@router.get("/advanced")
def list_advanced_notifications(
    user: User = Depends(require_permission("notification.read")),
    db: Session = Depends(get_db),
):
    from app.db.models import AdvancedNotification

    return db.query(AdvancedNotification).filter(
        AdvancedNotification.ps405Identification == user.identification
    ).order_by(AdvancedNotification.created_at.desc()).all()


@router.patch("/advanced/{notification_id}/read")
def mark_advanced_read(
    notification_id: int,
    request: Request,
    user: User = Depends(require_permission("notification.read")),
    db: Session = Depends(get_db),
):
    from app.db.models import AdvancedNotification

    item = db.get(AdvancedNotification, notification_id)
    if not item or item.ps405Identification != user.identification:
        raise HTTPException(status_code=404, detail="Notification not found")
    item.status = "read"
    write_audit(
        db,
        action="advanced_notification_read",
        module="notifications",
        user_id=user.identification,
        entity="notification",
        entity_id=item.idNotification,
        request=request,
    )
    db.commit()
    return item