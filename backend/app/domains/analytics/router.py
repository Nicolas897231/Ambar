from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import (
    AdvancedNotification,
    AuditLog,
    ArchiveUser,
    Document,
    DocumentFile,
    DocumentLoan,
    DocumentTransfer,
    Notification,
    PhysicalBox,
    TransferBatch,
    TransferBatchItem,
    User,
    WorkflowTask,
)
from app.db.session import get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _allowed_archive_ids(db: Session, user: User) -> list[int] | None:
    permissions = user_permissions(db, user)
    if "*" in permissions:
        return None
    return [
        item.ps930IdArchive
        for item in db.query(ArchiveUser.ps930IdArchive)
        .filter(ArchiveUser.ps405Identification == user.identification)
        .all()
    ]


def _filter_allowed_archives(query, column, archive_ids: list[int] | None):
    if archive_ids is None:
        return query
    if not archive_ids:
        return query.filter(False)
    return query.filter(column.in_(archive_ids))


@router.get("/dashboard")
def dashboard(
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    documents_query = db.query(Document).filter(Document.company_id == user.company_id)
    archive_ids = _allowed_archive_ids(db, user)
    total_documents = documents_query.count()
    pending_transfers = (
        db.query(DocumentTransfer)
        .join(Document, Document.idDocument == DocumentTransfer.ps520IdDocument)
        .filter(Document.company_id == user.company_id, DocumentTransfer.status.in_(["pending", "approved", "in_transit"]))
        .count()
    )
    incomplete_documents = documents_query.filter(~Document.files.any()).count()
    unread_notifications = db.query(Notification).filter(Notification.ps405Identification == user.identification, Notification.read_status.is_(False)).count()
    unread_notifications += db.query(AdvancedNotification).filter(AdvancedNotification.ps405Identification == user.identification, AdvancedNotification.status.in_(["pending", "unread", "action_required"])).count()
    since = datetime.now(UTC) - timedelta(days=1)
    activity_query = db.query(AuditLog).filter(AuditLog.created_at >= since)
    if archive_ids is not None:
        activity_query = activity_query.filter(
            or_(AuditLog.ps930IdArchive.in_(archive_ids), AuditLog.ps405Identification == user.identification)
        ) if archive_ids else activity_query.filter(AuditLog.ps405Identification == user.identification)
    activity_daily = activity_query.count()
    classified = documents_query.filter(Document.ps612IdSubseries.isnot(None)).count()
    digitalized_documents = (
        db.query(func.count(func.distinct(DocumentFile.ps520IdDocument)))
        .join(Document, Document.idDocument == DocumentFile.ps520IdDocument)
        .filter(Document.company_id == user.company_id)
        .scalar()
        or 0
    )
    physical_documents = max(total_documents - digitalized_documents, 0)
    trd_compliance = round((classified / total_documents) * 100, 2) if total_documents else 100
    digitization_percent = round((digitalized_documents / total_documents) * 100, 2) if total_documents else 0
    risk_score = incomplete_documents + pending_transfers
    risk_level = "Alto" if risk_score >= 10 else "Medio" if risk_score >= 4 else "Bajo"
    by_status = dict(documents_query.with_entities(Document.status, func.count(Document.idDocument)).group_by(Document.status).all())
    active_users = db.query(User).filter(User.company_id == user.company_id, User.status == "active").count()
    loans_query = _filter_allowed_archives(db.query(DocumentLoan), DocumentLoan.ps930IdArchive, archive_ids)
    boxes_query = _filter_allowed_archives(db.query(PhysicalBox), PhysicalBox.ps930IdArchive, archive_ids)
    active_loans = loans_query.filter(DocumentLoan.status.in_(["active", "due_today", "overdue"])).count()
    overdue_loans = loans_query.filter(DocumentLoan.status == "overdue").count()
    archived_boxes = boxes_query.count()
    return {
        "total_documents": total_documents,
        "digitalized_documents": digitalized_documents,
        "physical_documents": physical_documents,
        "digitization_percent": digitization_percent,
        "pending_transfers": pending_transfers,
        "incomplete_documents": incomplete_documents,
        "expired_documents": 0,
        "active_users": active_users,
        "active_loans": active_loans,
        "overdue_loans": overdue_loans,
        "archived_boxes": archived_boxes,
        "activity_daily": activity_daily,
        "trd_compliance": trd_compliance,
        "unread_notifications": unread_notifications,
        "action_required": db.query(AdvancedNotification).filter(AdvancedNotification.ps405Identification == user.identification, AdvancedNotification.status == "action_required").count(),
        "risk_level": risk_level,
        "documents_by_status": by_status,
    }


@router.get("/advanced")
def advanced_dashboard(
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    from app.db.models import Employee, EmployeeContract, WorkflowInstance

    archive_ids = _allowed_archive_ids(db, user)
    active_workflows = db.query(WorkflowInstance).filter(WorkflowInstance.status == "in_progress").count()
    pending_tasks = db.query(WorkflowTask).filter(WorkflowTask.ps405Identification == user.identification, WorkflowTask.status.in_(["pending", "in_progress", "in_review"])).count()
    overdue_tasks = db.query(WorkflowTask).filter(WorkflowTask.ps405Identification == user.identification, WorkflowTask.status == "overdue").count()
    overdue_tasks += db.query(WorkflowTask).filter(WorkflowTask.ps405Identification == user.identification, WorkflowTask.status.in_(["pending", "in_progress", "in_review"]), WorkflowTask.due_date < datetime.now(UTC)).count()
    batches_query = db.query(TransferBatch).filter(TransferBatch.status.notin_(["closed", "rejected"]))
    if archive_ids is not None:
        batches_query = batches_query.filter(
            TransferBatch.ps930OriginArchiveId.in_(archive_ids) | TransferBatch.ps930DestinationArchiveId.in_(archive_ids)
        ) if archive_ids else batches_query.filter(False)
    active_batches = batches_query.count()
    receptions_query = db.query(TransferBatchItem).filter(TransferBatchItem.status.in_(["pending", "pending_review", "with_inconsistency"]))
    receptions_query = _filter_allowed_archives(receptions_query, TransferBatchItem.ps930OriginArchiveId, archive_ids)
    pending_receptions = receptions_query.count()
    overdue_loans = _filter_allowed_archives(db.query(DocumentLoan), DocumentLoan.ps930IdArchive, archive_ids).filter(DocumentLoan.status == "overdue").count()
    employees = db.query(Employee).filter(Employee.company_id == user.company_id).count()
    active_contracts = (
        db.query(EmployeeContract)
        .join(Employee, Employee.identification == EmployeeContract.ps1010Identification)
        .filter(Employee.company_id == user.company_id, EmployeeContract.status == "active")
        .count()
    )
    operational_load = pending_tasks + active_batches
    risk_level = "Alto" if overdue_tasks >= 5 else "Medio" if overdue_tasks >= 1 else "Bajo"
    return {
        "active_workflows": active_workflows,
        "pending_tasks": pending_tasks,
        "overdue_tasks": overdue_tasks,
        "action_required": db.query(AdvancedNotification).filter(AdvancedNotification.ps405Identification == user.identification, AdvancedNotification.status == "action_required").count(),
        "pending_receptions": pending_receptions,
        "overdue_loans": overdue_loans,
        "active_transfer_batches": active_batches,
        "employees": employees,
        "active_contracts": active_contracts,
        "operational_load": operational_load,
        "risk_level": risk_level,
    }
