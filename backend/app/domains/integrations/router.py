import os
import re

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import Integration, IntegrationLog, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event

router = APIRouter(prefix="/integrations", tags=["integrations"])


class IntegrationCreate(BaseModel):
    integration_name: str = Field(min_length=3, max_length=160)
    integration_type: str = Field(pattern="^(sap|odoo|dynamics|netsuite|siigo|helisa|payroll|generic_rest|document_ingest)$")
    config_data: dict = Field(default_factory=dict)


class SyncRequest(BaseModel):
    entity_type: str = Field(min_length=2, max_length=80)
    entity_id: str = Field(min_length=1, max_length=80)
    payload: dict = Field(default_factory=dict)


ALLOWED_DIRECTIONS = {"send", "receive", "sync"}
ALLOWED_METHODS = {"GET", "POST", "PUT", "PATCH"}
SECRET_REF_RE = re.compile(r"^[A-Z][A-Z0-9_]{2,80}$")


def _normalize_config(config: dict) -> dict:
    config = dict(config or {})
    forbidden_secret_fields = {"token", "password", "secret", "api_key", "client_secret"}
    leaked = sorted(key for key in config if key.lower() in forbidden_secret_fields and config.get(key))
    if leaked:
        raise HTTPException(status_code=422, detail=f"No guardes secretos directos en config_data: {', '.join(leaked)}. Usa secret_ref.")

    direction = str(config.get("direction") or "send").lower()
    if direction not in ALLOWED_DIRECTIONS:
        raise HTTPException(status_code=422, detail="direction debe ser send, receive o sync")

    method = str(config.get("http_method") or config.get("method") or ("GET" if direction == "receive" else "POST")).upper()
    if method not in ALLOWED_METHODS:
        raise HTTPException(status_code=422, detail="http_method debe ser GET, POST, PUT o PATCH")

    endpoint_path = str(config.get("endpoint_path") or config.get("path") or "").strip()
    if endpoint_path and not endpoint_path.startswith("/"):
        raise HTTPException(status_code=422, detail="endpoint_path debe iniciar con /")

    auth = dict(config.get("auth") or {})
    auth_type = str(config.get("auth_type") or auth.get("type") or "none").lower()
    secret_ref = str(config.get("secret_ref") or config.get("token_env") or auth.get("secret_ref") or "").strip()
    if secret_ref and not SECRET_REF_RE.match(secret_ref):
        raise HTTPException(status_code=422, detail="secret_ref debe ser el nombre de una variable de entorno, por ejemplo ERP_TOKEN")

    config["direction"] = direction
    config["http_method"] = method
    config["endpoint_path"] = endpoint_path
    config["auth"] = {"type": auth_type, "secret_ref": secret_ref}
    config.pop("method", None)
    config.pop("path", None)
    config.pop("token_env", None)
    config.pop("auth_type", None)
    config.pop("secret_ref", None)
    return config


@router.get("")
def list_integrations(db: Session = Depends(get_db), _: User = Depends(require_permission("integration.manage"))):
    return db.query(Integration).order_by(Integration.integration_name.asc()).all()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_integration(payload: IntegrationCreate, request: Request, user: User = Depends(require_permission("integration.manage")), db: Session = Depends(get_db)):
    body = payload.model_dump()
    body["config_data"] = _normalize_config(body.get("config_data") or {})
    item = Integration(**body, status="active")
    db.add(item)
    db.flush()
    write_audit(db, action="integration_created", module="integrations", user_id=user.identification, entity="integration", entity_id=item.idIntegration, new_values={"name": item.integration_name, "type": item.integration_type}, request=request)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{integration_id}/sync", status_code=status.HTTP_201_CREATED)
def sync_integration(integration_id: int, payload: SyncRequest, request: Request, user: User = Depends(require_permission("integration.manage")), db: Session = Depends(get_db)):
    integration = db.get(Integration, integration_id)
    if not integration or integration.status != "active":
        raise HTTPException(status_code=404, detail="Integration not found")
    config = _normalize_config(integration.config_data or {})
    secret_ref = (config.get("auth") or {}).get("secret_ref") or ""
    transformed = {
        "adapter": integration.integration_type,
        "direction": config.get("direction"),
        "http_method": config.get("http_method"),
        "endpoint_path": config.get("endpoint_path"),
        "auth": {
            "type": (config.get("auth") or {}).get("type"),
            "secret_ref": secret_ref,
            "secret_configured": bool(secret_ref and os.getenv(secret_ref)),
        },
        "external_reference": f"{payload.entity_type}:{payload.entity_id}",
        "payload": payload.payload,
    }
    response = {
        "accepted": True,
        "mode": "queued",
        "execution": "queued_only",
        "integration": integration.integration_name,
        "secret_configured": transformed["auth"]["secret_configured"],
    }
    log = IntegrationLog(ps1280IdIntegration=integration.idIntegration, request_payload=transformed, response_payload=response, status="queued")
    db.add(log)
    db.flush()
    write_audit(db, action="integration_sync_queued", module="integrations", user_id=user.identification, entity="integration", entity_id=integration.idIntegration, new_values=transformed, request=request)
    db.commit()
    publish_event("integration.synced", {"integration_id": integration.idIntegration, "log_id": log.idLog})
    db.refresh(log)
    return log


@router.get("/{integration_id}/logs")
def integration_logs(integration_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("integration.manage"))):
    return db.query(IntegrationLog).filter(IntegrationLog.ps1280IdIntegration == integration_id).order_by(IntegrationLog.created_at.desc()).limit(100).all()
