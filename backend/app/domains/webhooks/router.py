from datetime import UTC, datetime
import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import require_permission
from app.db.models import User, WebhookDelivery, WebhookEndpoint
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.crypto import decrypt_text, encrypt_text, new_token, sign_payload, verify_signed_payload
from app.services.events import publish_event

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookEndpointCreate(BaseModel):
    endpoint_name: str = Field(min_length=3, max_length=160)
    target_url: HttpUrl
    event_type: str = Field(min_length=3, max_length=120)


class WebhookEmit(BaseModel):
    event_type: str
    payload: dict = Field(default_factory=dict)


def _canonical_body(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _endpoint_secret(endpoint: WebhookEndpoint) -> str:
    stored = endpoint.secret_hash
    try:
        return decrypt_text(stored)
    except ValueError:
        # Backward compatibility for endpoints created before encrypted webhook secrets.
        return stored


@router.post("/endpoints", status_code=status.HTTP_201_CREATED)
def create_endpoint(
    payload: WebhookEndpointCreate,
    request: Request,
    user: User = Depends(require_permission("webhook.manage")),
    db: Session = Depends(get_db),
):
    secret = new_token()
    item = WebhookEndpoint(
        endpoint_name=payload.endpoint_name,
        target_url=str(payload.target_url),
        event_type=payload.event_type,
        secret_hash=encrypt_text(secret),
        status="active",
    )
    db.add(item)
    db.flush()
    write_audit(
        db,
        action="webhook_endpoint_created",
        module="webhooks",
        user_id=user.identification,
        entity="webhook_endpoint",
        entity_id=item.idEndpoint,
        new_values={"name": item.endpoint_name, "event_type": item.event_type},
        request=request,
    )
    db.commit()
    db.refresh(item)
    return {"endpoint": item, "secret": secret}


@router.get("/endpoints")
def list_endpoints(db: Session = Depends(get_db), _: User = Depends(require_permission("webhook.manage"))):
    return db.query(WebhookEndpoint).order_by(WebhookEndpoint.created_at.desc()).all()


@router.post("/emit", status_code=status.HTTP_201_CREATED)
def emit_webhook(
    payload: WebhookEmit,
    request: Request,
    user: User = Depends(require_permission("webhook.manage")),
    db: Session = Depends(get_db),
):
    endpoints = (
        db.query(WebhookEndpoint)
        .filter(WebhookEndpoint.event_type == payload.event_type, WebhookEndpoint.status == "active")
        .all()
    )
    deliveries = []
    timestamp = str(int(datetime.now(UTC).timestamp()))
    body = _canonical_body(payload.payload)
    for endpoint in endpoints:
        signature = sign_payload(_endpoint_secret(endpoint), timestamp, body)
        delivery = WebhookDelivery(
            ps1300IdEndpoint=endpoint.idEndpoint,
            event_type=payload.event_type,
            payload={"timestamp": timestamp, "body": payload.payload, "target_url": endpoint.target_url},
            delivery_status="queued",
            attempts=0,
            signature=signature,
        )
        db.add(delivery)
        deliveries.append(delivery)
    write_audit(
        db,
        action="webhook_emit_queued",
        module="webhooks",
        user_id=user.identification,
        new_values={"event_type": payload.event_type, "deliveries": len(deliveries)},
        request=request,
    )
    db.commit()
    publish_event("webhook.received", {"event_type": payload.event_type, "deliveries": len(deliveries)})
    return {"queued": len(deliveries)}


@router.post("/incoming/{endpoint_id}")
async def receive_webhook(
    endpoint_id: int,
    request: Request,
    x_ambar_timestamp: str = Header(default=""),
    x_ambar_signature: str = Header(default=""),
    db: Session = Depends(get_db),
):
    endpoint = db.get(WebhookEndpoint, endpoint_id)
    if not endpoint or endpoint.status != "active":
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    body = (await request.body()).decode("utf-8")
    if not verify_signed_payload(
        _endpoint_secret(endpoint),
        x_ambar_timestamp,
        body,
        x_ambar_signature,
        tolerance_seconds=get_settings().webhook_signature_tolerance_seconds,
    ):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")
    try:
        incoming_payload = json.loads(body or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON payload") from exc
    delivery = WebhookDelivery(
        ps1300IdEndpoint=endpoint.idEndpoint,
        event_type=endpoint.event_type,
        payload=incoming_payload,
        delivery_status="received",
        attempts=1,
        signature=x_ambar_signature,
    )
    db.add(delivery)
    write_audit(
        db,
        action="webhook_received",
        module="webhooks",
        entity="webhook_endpoint",
        entity_id=endpoint.idEndpoint,
        new_values=incoming_payload,
        request=request,
    )
    db.commit()
    publish_event("webhook.received", {"endpoint_id": endpoint.idEndpoint, "event_type": endpoint.event_type})
    return {"status": "received"}


@router.get("/deliveries")
def list_deliveries(db: Session = Depends(get_db), _: User = Depends(require_permission("webhook.manage"))):
    return db.query(WebhookDelivery).order_by(WebhookDelivery.created_at.desc()).limit(100).all()