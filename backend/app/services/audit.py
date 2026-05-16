from fastapi import Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session

from app.db.models import AuditLog


def write_audit(
    db: Session,
    *,
    action: str,
    module: str,
    user_id: str | None = None,
    entity: str | None = None,
    entity_id: str | int | None = None,
    old_values: dict | None = None,
    new_values: dict | None = None,
    request: Request | None = None,
) -> None:
    ip_address = request.client.host if request and request.client else None
    db.add(
        AuditLog(
            ps405Identification=user_id,
            action=action,
            module=module,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            old_values=jsonable_encoder(old_values) if old_values is not None else None,
            new_values=jsonable_encoder(new_values) if new_values is not None else None,
            ip_address=ip_address,
        )
    )