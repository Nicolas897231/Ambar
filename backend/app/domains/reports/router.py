from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AdvancedNotification, AuditLog, Document, Employee, EmployeeContract, NotificationDeliveryLog, ReportJob, TransferBatch, User, WorkflowTask
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportRequest(BaseModel):
    report_type: str = Field(pattern="^(operational|executive|audit|compliance|hr)$")


def _generate_csv(db: Session, report_type: str, job_id: int) -> str:
    output_dir = Path("reports")
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"report_{report_type}_{job_id}.csv"
    if report_type == "operational":
        rows = ["metric,value", f"pending_tasks,{db.query(WorkflowTask).filter(WorkflowTask.status != 'completed').count()}", f"active_batches,{db.query(TransferBatch).filter(TransferBatch.status != 'closed').count()}"]
    elif report_type == "hr":
        rows = ["metric,value", f"employees,{db.query(Employee).count()}", f"active_contracts,{db.query(EmployeeContract).filter(EmployeeContract.status == 'active').count()}"]
    elif report_type == "audit":
        rows = ["id,module,action,created_at"] + [f"{item.idAudit},{item.module},{item.action},{item.created_at}" for item in db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()]
    else:
        rows = ["metric,value", f"documents,{db.query(Document).count()}", f"generated_at,{datetime.now(UTC).isoformat()}"]
    path.write_text("\n".join(rows), encoding="utf-8")
    return str(path)


@router.post("/jobs", status_code=status.HTTP_201_CREATED)
def request_report(payload: ReportRequest, request: Request, user: User = Depends(require_permission("report.request")), db: Session = Depends(get_db)):
    job = ReportJob(report_type=payload.report_type, ps405Identification=user.identification, status="queued")
    db.add(job)
    db.flush()
    try:
        file_path = _generate_csv(db, payload.report_type, job.idJob)
        job.status = "completed"
        job.generated_file = file_path
        job.completed_at = datetime.now(UTC)
    except Exception as exc:
        job.status = "failed"
        write_audit(db, action="report_failed", module="reports", user_id=user.identification, entity="report_job", entity_id=job.idJob, new_values={"error": str(exc)}, request=request)
        db.commit()
        raise HTTPException(status_code=500, detail="Report generation failed") from exc
    note = AdvancedNotification(ps405Identification=user.identification, module="reports", message=f"Reporte {payload.report_type} generado", action_url=f"/reports?job={job.idJob}", status="pending")
    db.add(note)
    db.flush()
    db.add(NotificationDeliveryLog(ps1040IdNotification=note.idNotification, delivery_channel="in_app", delivery_status="stored"))
    write_audit(db, action="report_requested", module="reports", user_id=user.identification, entity="report_job", entity_id=job.idJob, new_values=payload.model_dump(), request=request)
    db.commit()
    publish_event("report.generated", {"job_id": job.idJob, "report_type": payload.report_type})
    db.refresh(job)
    return job


@router.get("/jobs")
def list_jobs(user: User = Depends(require_permission("report.request")), db: Session = Depends(get_db)):
    return db.query(ReportJob).filter(ReportJob.ps405Identification == user.identification).order_by(ReportJob.created_at.desc()).all()


@router.get("/jobs/{job_id}/download")
def download_job(job_id: int, request: Request, user: User = Depends(require_permission("report.request")), db: Session = Depends(get_db)):
    job = db.get(ReportJob, job_id)
    if not job or job.ps405Identification != user.identification:
        raise HTTPException(status_code=404, detail="Report not found")
    write_audit(db, action="report_downloaded", module="reports", user_id=user.identification, entity="report_job", entity_id=job.idJob, request=request)
    db.commit()
    return {"download_url": job.generated_file, "expires_in_seconds": 600}
