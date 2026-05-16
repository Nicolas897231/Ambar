from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import require_permission
from app.db.models import ReportJob, User
from app.db.session import get_db
from app.services.cache import get_json, set_json
from app.services.metrics import metrics_registry

router = APIRouter(prefix="/platform", tags=["platform"])


@router.get("/technical-dashboard")
def technical_dashboard(
    _: User = Depends(require_permission("platform.view")),
    db: Session = Depends(get_db),
):
    settings = get_settings()
    db_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
    redis_status = "ok"
    try:
        set_json("platform:probe", {"ok": True}, ttl=10)
        if not get_json("platform:probe"):
            redis_status = "degraded"
    except Exception:
        redis_status = "degraded"
    failed_reports = db.query(ReportJob).filter(ReportJob.status == "failed").count()
    return {
        "node": settings.cluster_node_id,
        "environment": settings.environment,
        "database": db_status,
        "redis": redis_status,
        "opensearch": "configured" if settings.opensearch_url else "fallback",
        "rabbitmq": "configured",
        "minio": "configured",
        "failed_report_jobs": failed_reports,
        "requests_recorded": sum(metrics_registry.requests.values()),
        "errors_recorded": sum(metrics_registry.errors.values()),
        "cache_ttl_seconds": settings.cache_default_ttl_seconds,
    }
