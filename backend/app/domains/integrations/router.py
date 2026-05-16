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
    integration_type: str = Field(pattern="^(sap|odoo|dynamics|netsuite|siigo|helisa|payroll|generic_rest)$")
    config_data: dict = Field(default_factory=dict)


class SyncRequest(BaseModel):
    entity_type: str = Field(min_length=2, max_length=80)
    entity_id: str = Field(min_length=1, max_length=80)
    payload: dict = Field(default_factory=dict)


@router.get("")
def list_integrations(db: Session = Depends(get_db), _: User = Depends(require_permission("integration.manage"))):
    return db.query(Integration).order_by(Integration.integration_name.asc()).all()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_integration(payload: IntegrationCreate, request: Request, user: User = Depends(require_permission("integration.manage")), db: Session = Depends(get_db)):
    item = Integration(**payload.model_dump(), status="active")
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
    transformed = {
        "adapter": integration.integration_type,
        "external_reference": f"{payload.entity_type}:{payload.entity_id}",
        "payload": payload.payload,
    }
    response = {"accepted": True, "mode": "queued", "integration": integration.integration_name}
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
