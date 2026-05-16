from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AuditLog, BiSnapshot, DataWarehouseFact, Document, Employee, IntegrationLog, OcrJob, ReportJob, SignatureRequest, User, WorkflowTask
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.cache import get_json, set_json
from app.services.events import publish_event

router = APIRouter(prefix="/bi", tags=["bi"])


def _metrics(db: Session) -> dict:
    ocr_total = db.query(OcrJob).count()
    ocr_completed = db.query(OcrJob).filter(OcrJob.status == "completed").count()
    signatures_pending = db.query(SignatureRequest).filter(SignatureRequest.status == "pending").count()
    failed_integrations = db.query(IntegrationLog).filter(IntegrationLog.status.in_(["failed", "error"])).count()
    return {
        "documents": db.query(Document).count(),
        "employees": db.query(Employee).count(),
        "pending_tasks": db.query(WorkflowTask).filter(WorkflowTask.status.in_(["pending", "in_progress"])).count(),
        "ocr_total": ocr_total,
        "ocr_completed": ocr_completed,
        "ocr_success_rate": round((ocr_completed / ocr_total) * 100, 2) if ocr_total else 100,
        "signatures_pending": signatures_pending,
        "failed_integrations": failed_integrations,
        "reports_failed": db.query(ReportJob).filter(ReportJob.status == "failed").count(),
        "critical_audit_events": db.query(AuditLog).filter(AuditLog.action.in_(["login_failed", "report_downloaded", "signature_completed"])).count(),
    }


@router.get("/executive-dashboard")
def executive_dashboard(_: User = Depends(require_permission("bi.view")), db: Session = Depends(get_db)):
    cached = get_json("bi:executive-dashboard")
    if cached:
        return cached
    metrics = _metrics(db)
    bottleneck = "OCR" if metrics["ocr_total"] and metrics["ocr_success_rate"] < 90 else "Operación documental"
    risk = "Alto" if metrics["failed_integrations"] or metrics["reports_failed"] else "Medio" if metrics["pending_tasks"] > 10 else "Bajo"
    payload = {**metrics, "risk_level": risk, "main_bottleneck": bottleneck}
    set_json("bi:executive-dashboard", payload, ttl=120)
    return payload


@router.post("/refresh")
def refresh_bi(request: Request, user: User = Depends(require_permission("bi.refresh")), db: Session = Depends(get_db)):
    metrics = _metrics(db)
    snapshot = BiSnapshot(snapshot_type="executive", metrics=metrics)
    db.add(snapshot)
    db.flush()
    db.add(DataWarehouseFact(fact_type="snapshot", source_entity="bi_snapshot", source_id=str(snapshot.idSnapshot), measure_data=metrics))
    write_audit(db, action="bi_refresh", module="bi", user_id=user.identification, entity="bi_snapshot", entity_id=snapshot.idSnapshot, new_values=metrics, request=request)
    db.commit()
    set_json("bi:executive-dashboard", {**metrics, "risk_level": "Bajo", "main_bottleneck": "Operación documental"}, ttl=120)
    publish_event("bi.refresh", {"snapshot_id": snapshot.idSnapshot})
    db.refresh(snapshot)
    return snapshot


@router.get("/snapshots")
def list_snapshots(db: Session = Depends(get_db), _: User = Depends(require_permission("bi.view"))):
    return db.query(BiSnapshot).order_by(BiSnapshot.created_at.desc()).limit(50).all()
