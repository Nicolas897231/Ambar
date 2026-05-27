from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.db.models import AuditLog

SENSITIVE_KEYS = {"password", "password_hash", "token", "access_token", "refresh_token", "secret", "x_api_key", "api_key", "authorization"}


def _sanitize(value):
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            if str(key).lower() in SENSITIVE_KEYS or any(secret in str(key).lower() for secret in ["password", "token", "secret"]):
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
        return "critical" if "permission" in action_l or "access" in action_l or "download" in action_l else "warning"
    if any(term in action_l for term in ["denied", "permission", "role", "access_granted", "access_revoked", "delete", "download_denied"]):
        return "critical"
    if any(term in action_l for term in ["rejected", "overdue", "blocked", "inconsistency", "failed"]):
        return "warning"
    return "info"


def write_audit(
    db: Session,
    *,
    action: str,
    module: str,
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
) -> None:
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    request_id = request.headers.get("x-request-id") if request else None
    db.add(
        AuditLog(
            ps405Identification=user_id,
            ps930IdArchive=archive_id,
            action=action,
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
        )
    )
