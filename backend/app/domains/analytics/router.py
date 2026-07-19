import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
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
    UserDashboardLayout,
    WorkflowTask,
)
from app.db.session import get_db
from app.services.cache import cached, delete_pattern

router = APIRouter(prefix="/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)


DEFAULT_WIDGET_KEYS = [
    "operational_queue",
    "document_kpis",
    "document_status",
    "digitalization_mix",
    "alerts",
    "tasks",
    "custody_risk",
    "hr_overview",
]


class DashboardLayoutPayload(BaseModel):
    layout_name: str = Field(default="operational", min_length=1, max_length=80)
    widgets: list[str] = Field(default_factory=list)
    is_default: bool = False


def _role_names(user: User) -> list[str]:
    return [item.role.role_name for item in user.roles]


def _dashboard_cache_key(user: User) -> str:
    return f"analytics:dashboard:{user.company_id}:{user.identification}"


def _advanced_cache_key(user: User) -> str:
    return f"analytics:advanced:{user.company_id}:{user.identification}"


def _widgets_cache_key(user: User, layout_name: str) -> str:
    return f"analytics:widgets:{user.company_id}:{user.identification}:{layout_name}"


def _layout_cache_key(user: User, layout_name: str) -> str:
    return f"analytics:layout:{user.company_id}:{user.identification}:{layout_name}"


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


def _dashboard_template_definitions() -> list[dict]:
    return [
        {
            "layout_name": "operational",
            "title": "Operativo",
            "description": "Vista diaria para custodios y analistas. Prioriza alertas, tareas y carga operativa.",
            "widgets": [
                {"key": "operational_queue", "visible": True, "order": 0, "size": "wide"},
                {"key": "document_kpis", "visible": True, "order": 1, "size": "wide"},
                {"key": "document_status", "visible": True, "order": 2, "size": "medium"},
                {"key": "digitalization_mix", "visible": True, "order": 3, "size": "medium"},
                {"key": "alerts", "visible": True, "order": 4, "size": "wide"},
                {"key": "tasks", "visible": True, "order": 5, "size": "medium"},
            ],
            "permissions": ["analytics.view", "document.read"],
        },
        {
            "layout_name": "custodia",
            "title": "Custodia documental",
            "description": "Para archivo y logística documental. Enfoca transferencias, préstamos, cajas y riesgo operativo.",
            "widgets": [
                {"key": "operational_queue", "visible": True, "order": 0, "size": "wide"},
                {"key": "custody_risk", "visible": True, "order": 1, "size": "medium"},
                {"key": "document_status", "visible": True, "order": 2, "size": "medium"},
                {"key": "alerts", "visible": True, "order": 3, "size": "wide"},
                {"key": "tasks", "visible": True, "order": 4, "size": "medium"},
            ],
            "permissions": ["archive.manage", "transfer.manage", "document.transfer", "analytics.view"],
        },
        {
            "layout_name": "rrhh",
            "title": "Talento humano",
            "description": "Lectura rápida para gestión de empleados, contratos, novedades y expedientes laborales.",
            "widgets": [
                {"key": "hr_overview", "visible": True, "order": 0, "size": "wide"},
                {"key": "document_kpis", "visible": True, "order": 1, "size": "medium"},
                {"key": "alerts", "visible": True, "order": 2, "size": "wide"},
                {"key": "tasks", "visible": True, "order": 3, "size": "medium"},
            ],
            "permissions": ["hr.view", "hr.manage", "recruit.view", "medical.view"],
        },
        {
            "layout_name": "direccion",
            "title": "Dirección",
            "description": "Tablero ejecutivo para gerencia. Resume volumen documental, cumplimiento y riesgo.",
            "widgets": [
                {"key": "document_kpis", "visible": True, "order": 0, "size": "wide"},
                {"key": "document_status", "visible": True, "order": 1, "size": "medium"},
                {"key": "digitalization_mix", "visible": True, "order": 2, "size": "medium"},
                {"key": "custody_risk", "visible": True, "order": 3, "size": "medium"},
                {"key": "hr_overview", "visible": True, "order": 4, "size": "medium"},
            ],
            "permissions": ["bi.view", "analytics.view", "document.read_all"],
        },
        {
            "layout_name": "seguridad",
            "title": "Seguridad y accesos",
            "description": "Pensado para administración. Reúne actividad, alertas y señales de control.",
            "widgets": [
                {"key": "operational_queue", "visible": True, "order": 0, "size": "wide"},
                {"key": "alerts", "visible": True, "order": 1, "size": "wide"},
                {"key": "custody_risk", "visible": True, "order": 2, "size": "medium"},
            ],
            "permissions": ["users.manage", "audit.view", "analytics.view"],
        },
    ]


def _template_suggestions(db: Session, user: User) -> list[dict]:
    templates = _dashboard_template_definitions()
    permissions = set(user_permissions(db, user))
    role_names = set(_role_names(user))
    recommended = []
    for template in templates:
        if "*" not in permissions and not any(permission in permissions for permission in template["permissions"]):
            continue
        score = 0
        if template["layout_name"] == "operational":
            score += 5
        if template["layout_name"] == "custodia" and {"jefe_archivo", "auxiliar_archivo", "archive_admin"} & role_names:
            score += 6
        if template["layout_name"] == "rrhh" and {"gerente_rrhh", "analista_rrhh", "hr_manager"} & role_names:
            score += 6
        if template["layout_name"] == "direccion" and {"super_admin", "gerencia", "auditor"} & role_names:
            score += 6
        if template["layout_name"] == "seguridad" and {"super_admin", "auditor"} & role_names:
            score += 6
        recommended.append({**template, "score": score})
    return sorted(recommended, key=lambda item: (-item["score"], item["layout_name"]))


@router.get("/dashboard")
def dashboard(
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    return cached(_dashboard_cache_key(user), lambda: _dashboard_payload(user, db), ttl=45)


def _dashboard_payload(user: User, db: Session) -> dict:
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
    return cached(_advanced_cache_key(user), lambda: _advanced_dashboard_payload(user, db), ttl=45)


def _has_any_permission(user: User, db: Session, permission: str | None) -> bool:
    if not permission:
        return True
    permissions = user_permissions(db, user)
    return "*" in permissions or permission in permissions


def _queue_items(dashboard: dict, advanced: dict, notifications: list[dict], tasks: list[dict], user: User, db: Session) -> list[dict]:
    queue = [
        {
            "key": "digitalize",
            "title": "Digitalizar documentos pendientes",
            "detail": f"{dashboard.get('incomplete_documents', 0)} registros sin archivo digital",
            "value": dashboard.get("incomplete_documents", 0),
            "route": "digitization",
            "icon": "scan-line",
            "tone": "warn",
            "permission": "ocr.manage",
        },
        {
            "key": "transfer",
            "title": "Revisar transferencias",
            "detail": f"{dashboard.get('pending_transfers', 0)} transferencias en proceso",
            "value": dashboard.get("pending_transfers", 0),
            "route": "transfers",
            "icon": "route",
            "tone": "brand",
            "permission": "transfer.manage",
        },
        {
            "key": "loan",
            "title": "Gestionar préstamos vencidos",
            "detail": f"{dashboard.get('overdue_loans', 0)} préstamos requieren devolución",
            "value": dashboard.get("overdue_loans", 0),
            "route": "loans",
            "icon": "package-check",
            "tone": "danger",
            "permission": "document.transfer",
        },
        {
            "key": "notifications",
            "title": "Leer alertas accionables",
            "detail": f"{len(notifications)} notificaciones visibles para tu usuario",
            "value": len(notifications),
            "route": "dashboard",
            "icon": "bell",
            "tone": "brand",
            "permission": "notification.read",
        },
        {
            "key": "tasks",
            "title": "Resolver tareas operativas",
            "detail": tasks[0].get("title") or tasks[0].get("description") or "Sin tareas urgentes asignadas" if tasks else "Sin tareas urgentes asignadas",
            "value": len(tasks),
            "route": tasks[0].get("module") or "dashboard" if tasks else "dashboard",
            "icon": "workflow",
            "tone": "info",
            "permission": "notification.read",
        },
        {
            "key": "risk",
            "title": "Revisar riesgo documental",
            "detail": f"Nivel {dashboard.get('risk_level', 'Bajo').lower()} para tu archivo",
            "value": 1 if dashboard.get("risk_level") in {"Medio", "Alto"} else 0,
            "route": "reports",
            "icon": "shield-alert",
            "tone": "danger",
            "permission": "analytics.view",
        },
    ]
    return [item for item in queue if item["value"] > 0 and _has_any_permission(user, db, item["permission"])]


def _quick_actions(user: User, db: Session) -> list[dict]:
    actions = [
        {"key": "expedient", "label": "Registrar expediente", "route": "expedients", "icon": "folder-kanban", "permission": "document.create"},
        {"key": "document", "label": "Registrar documento", "route": "documents", "icon": "file-text", "permission": "document.create"},
        {"key": "archive", "label": "Ubicar caja o carpeta", "route": "archive", "icon": "warehouse", "permission": "archive.manage"},
        {"key": "transfer", "label": "Preparar transferencia", "route": "transfers", "icon": "route", "permission": "transfer.manage"},
        {"key": "kardex", "label": "Consultar Kardex", "route": "kardex", "icon": "history", "permission": "document.read"},
        {"key": "search", "label": "Buscar documentos", "route": "documentSearch", "icon": "search", "permission": "search.query"},
    ]
    return [item for item in actions if _has_any_permission(user, db, item["permission"])]


def _dashboard_widgets(user: User, db: Session) -> list[dict]:
    dashboard = _dashboard_payload(user, db)
    advanced = _advanced_dashboard_payload(user, db)
    notifications = db.query(AdvancedNotification).filter(AdvancedNotification.ps405Identification == user.identification).order_by(AdvancedNotification.created_at.desc()).limit(8).all()
    tasks = db.query(WorkflowTask).filter(WorkflowTask.ps405Identification == user.identification).order_by(WorkflowTask.due_date.asc()).limit(8).all()
    task_rows = [
        {
            "id": task.idTask,
            "title": task.task_name,
            "description": task.resolution_note or task.task_name,
            "status": task.status,
            "due_date": task.due_date,
            "module": task.module or "dashboard",
            "route": task.action_url or task.module or "dashboard",
        }
        for task in tasks
    ]
    notif_rows = [
        {
            "id": note.idNotification,
            "title": note.title or note.message or "Notificación",
            "message": note.message or "",
            "module": note.module or "general",
            "created_at": note.created_at,
            "status": note.status,
        }
        for note in notifications
    ]
    widgets = [
        {
            "key": "operational_queue",
            "title": "Trabajo para hoy",
            "type": "list",
            "icon": "list-checks",
            "tone": "brand",
            "permission": "analytics.view",
            "size": "wide",
            "description": "Acciones reales calculadas con datos del backend",
            "data": _queue_items(dashboard, advanced, notif_rows, task_rows, user, db),
        },
        {
            "key": "document_kpis",
            "title": "Indicadores documentales",
            "type": "metrics",
            "icon": "file-text",
            "tone": "info",
            "permission": "analytics.view",
            "size": "wide",
            "description": "Resumen de volumen y trazabilidad",
            "data": {
                "total_documents": dashboard["total_documents"],
                "digitalized_documents": dashboard["digitalized_documents"],
                "incomplete_documents": dashboard["incomplete_documents"],
                "active_users": dashboard["active_users"],
                "archived_boxes": dashboard["archived_boxes"],
                "active_loans": dashboard["active_loans"],
                "overdue_loans": dashboard["overdue_loans"],
                "pending_transfers": dashboard["pending_transfers"],
            },
        },
        {
            "key": "document_status",
            "title": "Estado documental",
            "type": "bars",
            "icon": "bar-chart",
            "tone": "brand",
            "permission": "analytics.view",
            "size": "medium",
            "description": "Distribución real por estado de documentos",
            "data": [{"label": key, "value": value} for key, value in dashboard["documents_by_status"].items()],
        },
        {
            "key": "digitalization_mix",
            "title": "Cobertura digital",
            "type": "donut",
            "icon": "pie-chart",
            "tone": "info",
            "permission": "ocr.manage",
            "size": "medium",
            "description": "Digitalizados vs solo físicos",
            "data": [
                {"label": "Digitalizados", "value": dashboard["digitalized_documents"]},
                {"label": "Solo físicos", "value": dashboard["physical_documents"]},
            ],
            "center_value": dashboard["total_documents"],
            "center_label": "documentos",
        },
        {
            "key": "alerts",
            "title": "Alertas recientes",
            "type": "timeline",
            "icon": "bell",
            "tone": "warn",
            "permission": "notification.read",
            "size": "wide",
            "description": "Notificaciones visibles para tu usuario",
            "data": notif_rows,
        },
        {
            "key": "tasks",
            "title": "Tareas pendientes",
            "type": "list",
            "icon": "workflow",
            "tone": "danger",
            "permission": "notification.read",
            "size": "medium",
            "description": "Asignadas a tu usuario",
            "data": task_rows,
        },
        {
            "key": "custody_risk",
            "title": "Riesgo operativo",
            "type": "metrics",
            "icon": "shield-alert",
            "tone": "danger",
            "permission": "analytics.view",
            "size": "medium",
            "description": "Señales de riesgo de custodia",
            "data": {
                "risk_level": dashboard["risk_level"],
                "pending_transfers": dashboard["pending_transfers"],
                "overdue_loans": dashboard["overdue_loans"],
                "activity_daily": dashboard["activity_daily"],
                "action_required": dashboard["action_required"],
            },
        },
        {
            "key": "hr_overview",
            "title": "Talento humano",
            "type": "metrics",
            "icon": "users",
            "tone": "brand",
            "permission": "hr.view",
            "size": "medium",
            "description": "Lectura rápida de RRHH conectado",
            "data": {
                "employees": advanced["employees"],
                "active_contracts": advanced["active_contracts"],
                "active_workflows": advanced["active_workflows"],
                "pending_receptions": advanced["pending_receptions"],
                "overdue_tasks": advanced["overdue_tasks"],
            },
        },
    ]
    return [widget for widget in widgets if _has_any_permission(user, db, widget["permission"])]


def _default_layout() -> list[dict]:
    return [
        {"key": "operational_queue", "visible": True, "order": 0, "size": "wide"},
        {"key": "document_kpis", "visible": True, "order": 1, "size": "wide"},
        {"key": "document_status", "visible": True, "order": 2, "size": "medium"},
        {"key": "digitalization_mix", "visible": True, "order": 3, "size": "medium"},
        {"key": "alerts", "visible": True, "order": 4, "size": "wide"},
        {"key": "tasks", "visible": True, "order": 5, "size": "medium"},
    ]


def _normalize_layout_items(items: list[dict] | list[str] | None) -> list[dict]:
    if not items:
        return _default_layout()
    normalized: list[dict] = []
    for index, item in enumerate(items):
        if isinstance(item, str):
            normalized.append({"key": item, "visible": True, "order": index, "size": "medium"})
            continue
        key = str(item.get("key") or "").strip()
        if not key:
            continue
        normalized.append({
            "key": key,
            "visible": bool(item.get("visible", True)),
            "order": int(item.get("order", index)),
            "size": item.get("size") or "medium",
        })
    if not normalized:
        return _default_layout()
    return normalized


def _selected_layout(db: Session, user: User) -> list[dict]:
    layout = (
        db.query(UserDashboardLayout)
        .filter(UserDashboardLayout.ps405Identification == user.identification, UserDashboardLayout.is_default.is_(True))
        .order_by(UserDashboardLayout.updated_at.desc())
        .first()
    )
    if not layout:
        layout = (
            db.query(UserDashboardLayout)
            .filter(UserDashboardLayout.ps405Identification == user.identification, UserDashboardLayout.layout_name == "operational")
            .order_by(UserDashboardLayout.updated_at.desc())
            .first()
        )
    if not layout:
        return _default_layout()
    return _normalize_layout_items(layout.widgets)


@router.get("/widgets")
def dashboard_widgets(
    layout_name: str = "operational",
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    return cached(_widgets_cache_key(user, layout_name), lambda: _dashboard_widgets_payload(user, db, layout_name), ttl=60)


@router.get("/layout")
def get_dashboard_layout(
    layout_name: str = "operational",
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    return cached(_layout_cache_key(user, layout_name), lambda: {"layout_name": layout_name, "widgets": _layout_by_name(db, user, layout_name)}, ttl=60)


@router.get("/layouts")
def list_dashboard_layouts(
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    layouts = (
        db.query(UserDashboardLayout)
        .filter(UserDashboardLayout.ps405Identification == user.identification)
        .order_by(UserDashboardLayout.is_default.desc(), UserDashboardLayout.updated_at.desc())
        .all()
    )
    return {
        "layouts": [
            {
                "layout_name": layout.layout_name,
                "is_default": bool(layout.is_default),
                "updated_at": layout.updated_at,
                "widgets_count": len(layout.widgets or []),
            }
            for layout in layouts
        ]
    }


@router.get("/templates")
def list_dashboard_templates(
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    return {
        "templates": [
            {
                "layout_name": template["layout_name"],
                "title": template["title"],
                "description": template["description"],
                "widgets": template["widgets"],
                "permissions": template["permissions"],
                "recommended": template.get("score", 0) > 0,
            }
            for template in _template_suggestions(db, user)
        ]
    }


def _layout_by_name(db: Session, user: User, layout_name: str) -> list[dict]:
    layout = (
        db.query(UserDashboardLayout)
        .filter(UserDashboardLayout.ps405Identification == user.identification, UserDashboardLayout.layout_name == layout_name)
        .first()
    )
    if not layout:
        if layout_name == "operational":
            return _selected_layout(db, user)
        return _default_layout()
    return _normalize_layout_items(layout.widgets)


def _dashboard_widgets_payload(user: User, db: Session, layout_name: str) -> dict:
    layout = _selected_layout(db, user) if layout_name == "operational" else _layout_by_name(db, user, layout_name)
    widgets = _dashboard_widgets(user, db)
    widget_map = {widget["key"]: widget for widget in widgets}
    ordered = []
    for item in sorted(layout, key=lambda row: row["order"]):
        widget = widget_map.get(item["key"])
        if not widget:
            continue
        ordered.append({**widget, "visible": item["visible"], "size": item["size"], "order": item["order"]})
    extras = [widget for widget in widgets if widget["key"] not in {item["key"] for item in layout}]
    return {
        "layout_name": layout_name,
        "widgets": ordered + extras,
        "available_widgets": widgets,
        "layout": layout,
    }


@router.put("/layout")
def save_dashboard_layout(
    payload: DashboardLayoutPayload,
    user: User = Depends(require_permission("analytics.view")),
    db: Session = Depends(get_db),
):
    available_keys = {widget["key"] for widget in _dashboard_widgets(user, db)}
    normalized = []
    seen: set[str] = set()
    for index, key in enumerate(payload.widgets or DEFAULT_WIDGET_KEYS):
        if key not in available_keys or key in seen:
            continue
        seen.add(key)
        normalized.append({"key": key, "visible": True, "order": index, "size": "medium"})
    if not normalized:
        normalized = _default_layout()
    if payload.is_default:
        db.query(UserDashboardLayout).filter(
            UserDashboardLayout.ps405Identification == user.identification
        ).update({"is_default": False}, synchronize_session=False)
    layout = (
        db.query(UserDashboardLayout)
        .filter(UserDashboardLayout.ps405Identification == user.identification, UserDashboardLayout.layout_name == payload.layout_name)
        .first()
    )
    if not layout:
        layout = UserDashboardLayout(ps405Identification=user.identification, company_id=user.company_id, layout_name=payload.layout_name, widgets=normalized, is_default=payload.layout_name == "operational")
        db.add(layout)
    else:
        layout.widgets = normalized
        layout.is_default = payload.is_default or payload.layout_name == "operational"
    db.commit()
    db.refresh(layout)
    delete_pattern(f"analytics:*:{user.company_id}:{user.identification}:*")
    return {"layout_name": layout.layout_name, "widgets": layout.widgets, "is_default": layout.is_default}



def _advanced_dashboard_payload(user: User, db: Session) -> dict:
    fallback = {
        "active_workflows": 0,
        "pending_tasks": 0,
        "overdue_tasks": 0,
        "action_required": 0,
        "pending_receptions": 0,
        "overdue_loans": 0,
        "active_transfer_batches": 0,
        "employees": 0,
        "active_contracts": 0,
        "operational_load": 0,
        "risk_level": "Bajo",
    }
    try:
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
    except Exception:
        logger.exception("advanced analytics summary failed")
        db.rollback()
        return fallback
