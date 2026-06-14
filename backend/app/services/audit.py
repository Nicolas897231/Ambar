"""
Sistema de auditoría equivalente a Laravel Auditing.

Cada evento registra:
  user_id, event, auditable_type, auditable_id,
  old_values, new_values, url, ip_address, user_agent,
  tags, severity, result, module, action, created_at

Eventos cubiertos:
  create · update · delete · restore · login · logout
  download · export · permission_change · failed_login · access_denied
"""

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.db.models import AuditLog

SENSITIVE_KEYS = {
    "password", "password_hash", "token", "access_token", "refresh_token",
    "secret", "x_api_key", "api_key", "authorization", "mfa_secret",
    "diagnostico", "eps", "arl", "afp",  # datos médicos sensibles
}


def _sanitize(value):
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            if str(key).lower() in SENSITIVE_KEYS or any(
                s in str(key).lower() for s in ["password", "token", "secret", "hash"]
            ):
                sanitized[key] = "***redacted***"
            else:
                sanitized[key] = _sanitize(item)
        return sanitized
    if isinstance(value, list):
        return [_sanitize(item) for item in value]
    return value


def _severity(action: str, result: str, explicit: str | None) -> str:
    if explicit:
        return explicit
    action_l = action.lower()
    if result in {"denied", "failed"}:
        return "critical" if any(t in action_l for t in ["permission", "access", "download", "login"]) else "warning"
    if any(t in action_l for t in ["denied", "permission", "role", "access_granted", "access_revoked", "delete", "download_denied", "permission_change"]):
        return "critical"
    if any(t in action_l for t in ["rejected", "overdue", "blocked", "inconsistency", "failed", "logout"]):
        return "warning"
    return "info"


def _event_from_action(action: str, explicit: str | None) -> str:
    """Normaliza el nombre de la acción al vocabulario de evento estándar."""
    if explicit:
        return explicit
    a = action.lower()
    if "created" in a:
        return "create"
    if "updated" in a or "metadata" in a:
        return "update"
    if "deleted" in a or "disposed" in a:
        return "delete"
    if "restored" in a:
        return "restore"
    if "login_success" in a:
        return "login"
    if "logout" in a:
        return "logout"
    if "download" in a:
        return "download"
    if "export" in a:
        return "export"
    if "permission" in a and "change" in a:
        return "permission_change"
    if "login_failed" in a or "failed_login" in a:
        return "failed_login"
    if "access_denied" in a or "denied" in a:
        return "access_denied"
    return action


def write_audit(
    db: Session,
    *,
    action: str,
    module: str,
    # Campos clásicos
    user_id: str | None = None,
    archive_id: int | None = None,
    entity: str | None = None,
    entity_id: str | int | None = None,
    entity_label: str | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
    result: str = "success",
    severity: str | None = None,
    request: Request | None = None,
    # Campos estilo Laravel Auditing
    event: str | None = None,
    auditable_type: str | None = None,
    auditable_id: str | int | None = None,
    tags: list[str] | None = None,
    url: str | None = None,
) -> None:
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    request_id = request.headers.get("x-request-id") if request else None
    # Derivar URL de la request si no fue pasada explícitamente
    resolved_url = url or (str(request.url) if request else None)
    # auditable_type/id puede venir explícito o deducirse de entity
    resolved_auditable_type = auditable_type or entity
    resolved_auditable_id = auditable_id if auditable_id is not None else entity_id

    db.add(
        AuditLog(
            ps405Identification=user_id,
            ps930IdArchive=archive_id,
            action=action,
            event=_event_from_action(action, event),
            module=module,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            entity_label=entity_label,
            old_values=jsonable_encoder(_sanitize(old_values)) if old_values is not None else None,
            new_values=jsonable_encoder(_sanitize(new_values)) if new_values is not None else None,
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
            result=result,
            severity=_severity(action, result, severity),
            auditable_type=resolved_auditable_type,
            auditable_id=str(resolved_auditable_id) if resolved_auditable_id is not None else None,
            tags=tags or [],
            url=resolved_url,
        )
    )
