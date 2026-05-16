from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AuditLog, User
from app.db.session import get_db

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs")
def list_audit_logs(
    skip: int = 0,
    limit: int = 50,
    module: str | None = None,
    _: User = Depends(require_permission("audit.view")),
    db: Session = Depends(get_db),
):
    limit = min(limit, 200)
    query = db.query(AuditLog)
    if module:
        query = query.filter(AuditLog.module == module)
    return query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
