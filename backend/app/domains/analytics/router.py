from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AuditLog, Document, DocumentTransfer, Notification, User
from app.db.session import get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
def dashboard(
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    documents_query = db.query(Document).filter(Document.company_id == user.company_id)
    total_documents = documents_query.count()
    pending_transfers = db.query(DocumentTransfer).filter(DocumentTransfer.status.in_(["pending", "approved", "in_transit"])).count()
    incomplete_documents = documents_query.filter(~Document.files.any()).count()
    unread_notifications = db.query(Notification).filter(Notification.ps405Identification == user.identification, Notification.read_status.is_(False)).count()
    since = datetime.now(UTC) - timedelta(days=1)
    activity_daily = db.query(AuditLog).filter(AuditLog.created_at >= since).count()
    classified = documents_query.filter(Document.ps612IdSubseries.isnot(None)).count()
    trd_compliance = round((classified / total_documents) * 100, 2) if total_documents else 100
    risk_score = incomplete_documents + pending_transfers
    risk_level = "Alto" if risk_score >= 10 else "Medio" if risk_score >= 4 else "Bajo"
    by_status = dict(db.query(Document.status, func.count(Document.idDocument)).group_by(Document.status).all())
    return {
        "total_documents": total_documents,
        "pending_transfers": pending_transfers,
        "incomplete_documents": incomplete_documents,
        "expired_documents": 0,
        "active_users": 1,
        "activity_daily": activity_daily,
        "trd_compliance": trd_compliance,
        "unread_notifications": unread_notifications,
        "risk_level": risk_level,
        "documents_by_status": by_status,
    }


@router.get("/advanced")
def advanced_dashboard(
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    from app.db.models import Employee, EmployeeContract, TransferBatch, WorkflowInstance, WorkflowTask

    active_workflows = db.query(WorkflowInstance).filter(WorkflowInstance.status == "in_progress").count()
    pending_tasks = db.query(WorkflowTask).filter(WorkflowTask.status.in_(["pending", "in_progress"])).count()
    overdue_tasks = db.query(WorkflowTask).filter(WorkflowTask.status.in_(["pending", "in_progress"]), WorkflowTask.due_date < datetime.now(UTC)).count()
    active_batches = db.query(TransferBatch).filter(TransferBatch.status.notin_(["closed", "rejected"])).count()
    employees = db.query(Employee).filter(Employee.company_id == user.company_id).count()
    active_contracts = db.query(EmployeeContract).filter(EmployeeContract.status == "active").count()
    operational_load = pending_tasks + active_batches
    risk_level = "Alto" if overdue_tasks >= 5 else "Medio" if overdue_tasks >= 1 else "Bajo"
    return {
        "active_workflows": active_workflows,
        "pending_tasks": pending_tasks,
        "overdue_tasks": overdue_tasks,
        "active_transfer_batches": active_batches,
        "employees": employees,
        "active_contracts": active_contracts,
        "operational_load": operational_load,
        "risk_level": risk_level,
    }