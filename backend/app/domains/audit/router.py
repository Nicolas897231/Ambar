from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import Archive, ArchiveUser, AuditLog, User
from app.db.session import get_db
from app.services.audit import write_audit

router = APIRouter(prefix="/audit", tags=["audit"])


def _is_global(user: User, db: Session) -> bool:
    permissions = user_permissions(db, user)
    return "*" in permissions or "archive.manage" in permissions


def _allowed_archive_ids(db: Session, user: User) -> list[int]:
    if _is_global(user, db):
        return [row.idArchive for row in db.query(Archive.idArchive).all()]
    return [row.ps930IdArchive for row in db.query(ArchiveUser).filter(ArchiveUser.ps405Identification == user.identification).all()]


def _audit_query(
    db: Session,
    user: User,
    *,
    module: str | None = None,
    action: str | None = None,
    user_id: str | None = None,
    archive_id: int | None = None,
    entity: str | None = None,
    entity_id: str | None = None,
    severity: str | None = None,
    result: str | None = None,
    ip_address: str | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    query = db.query(AuditLog)
    ids = _allowed_archive_ids(db, user)
    if not _is_global(user, db):
        query = query.filter(or_(AuditLog.ps930IdArchive.is_(None), AuditLog.ps930IdArchive.in_(ids)))
    if module:
        query = query.filter(AuditLog.module == module)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.ps405Identification == user_id)
    if archive_id:
        if archive_id not in ids and not _is_global(user, db):
            raise HTTPException(status_code=403, detail="Archive access denied")
        query = query.filter(AuditLog.ps930IdArchive == archive_id)
    if entity:
        query = query.filter(AuditLog.entity == entity)
    if entity_id:
        query = query.filter(AuditLog.entity_id == entity_id)
    if severity:
        query = query.filter(AuditLog.severity == severity)
    if result:
        query = query.filter(AuditLog.result == result)
    if ip_address:
        query = query.filter(AuditLog.ip_address == ip_address)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(AuditLog.action.ilike(term), AuditLog.module.ilike(term), AuditLog.entity.ilike(term), AuditLog.entity_label.ilike(term), AuditLog.entity_id.ilike(term)))
    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)
    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)
    return query


def _row(row: AuditLog) -> dict:
    return {
        "idAudit": row.idAudit,
        "user_id": row.ps405Identification,
        "ps405Identification": row.ps405Identification,
        "archive_id": row.ps930IdArchive,
        "module": row.module,
        "action": row.action,
        "entity": row.entity,
        "entity_type": row.entity,
        "entity_id": row.entity_id,
        "entity_label": row.entity_label,
        "old_values": row.old_values,
        "new_values": row.new_values,
        "ip_address": row.ip_address,
        "user_agent": row.user_agent,
        "request_id": row.request_id,
        "result": row.result or "success",
        "severity": row.severity or "info",
        "created_at": row.created_at,
    }


@router.get("")
@router.get("/logs")
def list_audit_logs(
    skip: int = 0,
    limit: int = 50,
    module: str | None = None,
    action: str | None = None,
    user_id: str | None = None,
    archive_id: int | None = None,
    entity: str | None = None,
    entity_id: str | None = None,
    severity: str | None = None,
    result: str | None = None,
    ip_address: str | None = None,
    q: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user: User = Depends(require_permission("audit.view")),
    db: Session = Depends(get_db),
):
    limit = min(limit, 200)
    if not date_from:
        date_from = datetime.now(UTC) - timedelta(days=30)
    query = _audit_query(db, user, module=module, action=action, user_id=user_id, archive_id=archive_id, entity=entity, entity_id=entity_id, severity=severity, result=result, ip_address=ip_address, q=q, date_from=date_from, date_to=date_to)
    return [_row(item) for item in query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()]


@router.get("/summary")
def audit_summary(user: User = Depends(require_permission("audit.view")), db: Session = Depends(get_db)):
    """Resumen mediante SQL aggregates — sin cargar filas en memoria (OOM fix)."""
    since = datetime.now(UTC) - timedelta(days=30)
    base_query = _audit_query(db, user, date_from=since)

    # Agregados en SQL — O(1) en memoria independiente del volumen de registros
    agg = base_query.with_entities(
        func.count(AuditLog.idAudit).label("total"),
        func.sum(case((AuditLog.severity == "critical", 1), else_=0)).label("critical"),
        func.sum(case((AuditLog.severity == "warning", 1), else_=0)).label("warning"),
        func.sum(case((AuditLog.result == "denied", 1), else_=0)).label("denied"),
        func.sum(case((AuditLog.result == "failed", 1), else_=0)).label("failed"),
    ).one()

    by_module = dict(
        base_query.with_entities(AuditLog.module, func.count(AuditLog.idAudit))
        .group_by(AuditLog.module)
        .all()
    )

    return {
        "total": agg.total or 0,
        "critical": int(agg.critical or 0),
        "warning": int(agg.warning or 0),
        "denied": int(agg.denied or 0),
        "failed": int(agg.failed or 0),
        "by_module": by_module,
    }


@router.get("/security-events")
def security_events(user: User = Depends(require_permission("audit.view")), db: Session = Depends(get_db)):
    query = _audit_query(db, user, severity="critical")
    return [_row(item) for item in query.order_by(AuditLog.created_at.desc()).limit(100).all()]


@router.get("/entity/{entity_type}/{entity_id}")
def entity_audit(entity_type: str, entity_id: str, user: User = Depends(require_permission("audit.view")), db: Session = Depends(get_db)):
    query = _audit_query(db, user, entity=entity_type, entity_id=entity_id)
    return [_row(item) for item in query.order_by(AuditLog.created_at.desc()).limit(100).all()]


@router.get("/export")
def export_audit_logs(
    request: Request,
    format: str = Query(default="csv", pattern="^(csv|xlsx)$"),
    module: str | None = None,
    action: str | None = None,
    user_id: str | None = None,
    archive_id: int | None = None,
    entity: str | None = None,
    entity_id: str | None = None,
    severity: str | None = None,
    result: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    user: User = Depends(require_permission("audit.export")),
    db: Session = Depends(get_db),
):
    if not date_from:
        date_from = datetime.now(UTC) - timedelta(days=30)
    query = _audit_query(db, user, module=module, action=action, user_id=user_id, archive_id=archive_id, entity=entity, entity_id=entity_id, severity=severity, result=result, date_from=date_from, date_to=date_to)
    # Streaming con yield_per para no cargar 2000 filas completas en RAM
    lines = ["created_at,user,archive_id,module,action,entity,entity_id,result,severity,ip_address,event,auditable_type,auditable_id"]
    for row in query.order_by(AuditLog.created_at.desc()).limit(2000).yield_per(200):
        lines.append(",".join([
            str(row.created_at),
            row.ps405Identification or "",
            str(row.ps930IdArchive or ""),
            row.module,
            row.action,
            row.entity or "",
            row.entity_id or "",
            row.result or "success",
            row.severity or "info",
            row.ip_address or "",
            getattr(row, "event", "") or "",
            getattr(row, "auditable_type", "") or "",
            getattr(row, "auditable_id", "") or "",
        ]))
    write_audit(db, action="audit_exported", event="export", module="audit", user_id=user.identification, archive_id=archive_id, entity="audit", auditable_type="AuditLog", result="success", severity="critical", tags=["auditoria", "export"], new_values={"format": format, "rows": len(lines) - 1}, request=request)
    db.commit()
    content = "\n".join(lines)
    if format == "xlsx":
        from app.domains.archives.router import _xlsx_from_lines

        return Response(content=_xlsx_from_lines(lines), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=auditoria_ambar.xlsx"})
    return Response(content=content, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=auditoria_ambar.csv"})


@router.get("/logs.csv")
def export_audit_logs_csv(request: Request, module: str | None = None, action: str | None = None, user_id: str | None = None, user: User = Depends(require_permission("audit.export")), db: Session = Depends(get_db)):
    return export_audit_logs(request=request, format="csv", module=module, action=action, user_id=user_id, user=user, db=db)


@router.get("/{audit_id}")
def audit_detail(audit_id: int, user: User = Depends(require_permission("audit.view")), db: Session = Depends(get_db)):
    item = db.get(AuditLog, audit_id)
    if not item:
        raise HTTPException(status_code=404, detail="Audit event not found")
    if item.ps930IdArchive and item.ps930IdArchive not in _allowed_archive_ids(db, user) and not _is_global(user, db):
        raise HTTPException(status_code=403, detail="Archive access denied")
    return _row(item)
