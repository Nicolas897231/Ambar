from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import Document, SignatureEvent, SignatureRequest, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.crypto import new_token, sha256_text
from app.services.events import publish_event

router = APIRouter(prefix="/signatures", tags=["signatures"])


def _is_expired(value: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value < datetime.now(UTC)


class SignatureCreate(BaseModel):
    document_id: int
    signer_identification: str = Field(min_length=4, max_length=40)
    expires_hours: int = Field(default=72, ge=1, le=720)


class SignatureComplete(BaseModel):
    token: str
    signer_identification: str
    evidence: dict = Field(default_factory=dict)


@router.post("/requests", status_code=status.HTTP_201_CREATED)
def create_signature_request(payload: SignatureCreate, request: Request, user: User = Depends(require_permission("signature.manage")), db: Session = Depends(get_db)):
    document = db.get(Document, payload.document_id)
    if not document or document.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    token = new_token()
    document_hash = sha256_text(f"{document.idDocument}:{document.version}:{document.document_name}:{document.metadata_json}")
    item = SignatureRequest(
        ps520IdDocument=document.idDocument,
        requested_by=user.identification,
        signer_identification=payload.signer_identification,
        status="pending",
        token_hash=sha256_text(token),
        document_hash=document_hash,
        expires_at=datetime.now(UTC) + timedelta(hours=payload.expires_hours),
    )
    db.add(item)
    db.flush()
    write_audit(db, action="signature_requested", module="signatures", user_id=user.identification, entity="signature_request", entity_id=item.idRequest, new_values={"document_id": document.idDocument, "signer": payload.signer_identification}, request=request)
    db.commit()
    db.refresh(item)
    return {"request": item, "signing_token": token}


@router.post("/requests/{request_id}/complete")
def complete_signature(request_id: int, payload: SignatureComplete, request: Request, user: User = Depends(require_permission("signature.manage")), db: Session = Depends(get_db)):
    item = db.get(SignatureRequest, request_id)
    if not item:
        raise HTTPException(status_code=404, detail="Signature request not found")
    if item.status != "pending" or _is_expired(item.expires_at):
        raise HTTPException(status_code=409, detail="Signature request is not active")
    if item.token_hash != sha256_text(payload.token) or item.signer_identification != payload.signer_identification:
        raise HTTPException(status_code=403, detail="Invalid signature token")
    item.status = "signed"
    event = SignatureEvent(
        ps1240IdRequest=item.idRequest,
        signer_identification=payload.signer_identification,
        ip_address=request.client.host if request.client else None,
        evidence_data={**payload.evidence, "document_hash": item.document_hash, "user_agent": request.headers.get("user-agent")},
    )
    db.add(event)
    write_audit(db, action="signature_completed", module="signatures", user_id=user.identification, entity="signature_request", entity_id=item.idRequest, new_values=event.evidence_data, request=request)
    db.commit()
    publish_event("signature.completed", {"request_id": item.idRequest, "document_id": item.ps520IdDocument})
    return {"status": "signed", "request_id": item.idRequest}


@router.get("/requests")
def list_signature_requests(db: Session = Depends(get_db), _: User = Depends(require_permission("signature.manage"))):
    return db.query(SignatureRequest).order_by(SignatureRequest.created_at.desc()).limit(100).all()
