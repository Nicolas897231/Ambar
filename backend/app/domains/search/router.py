from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import Document, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.search import index_document, search_documents

router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    q: str = ""
    document_type: str | None = None
    status: str | None = None
    location_id: int | None = None
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


def _doc_payload(document: Document) -> dict:
    return {
        "idDocument": document.idDocument,
        "document_name": document.document_name,
        "document_type": document.document_type,
        "status": document.status,
        "company_id": document.company_id,
        "location_id": document.location_id,
        "metadata": document.metadata_json or {},
        "version": document.version,
        "owner": document.ps405Identification,
        "created_at": document.created_at,
    }


@router.post("/documents")
def document_search(
    payload: SearchRequest,
    request: Request,
    user: User = Depends(require_permission("search.query")),
    db: Session = Depends(get_db),
):
    filters = {
        "company_id": user.company_id,
        "document_type": payload.document_type,
        "status": payload.status,
        "location_id": payload.location_id or user.location_id,
    }
    opensearch_response = search_documents(payload.q, filters, payload.page, payload.size)
    write_audit(
        db,
        action="search_documents",
        module="search",
        user_id=user.identification,
        new_values=payload.model_dump(),
        request=request,
    )
    db.commit()
    if opensearch_response is not None:
        return {"engine": "opensearch", "raw": opensearch_response}

    query = db.query(Document).filter(Document.company_id == user.company_id)
    if "document.read_all" not in user_permissions(db, user) and user.location_id:
        query = query.filter(Document.location_id == user.location_id)
    if payload.q:
        query = query.filter(Document.document_name.ilike(f"%{payload.q}%"))
    if payload.document_type:
        query = query.filter(Document.document_type == payload.document_type)
    if payload.status:
        query = query.filter(Document.status == payload.status)
    if payload.location_id:
        query = query.filter(Document.location_id == payload.location_id)
    total = query.count()
    items = query.order_by(Document.created_at.desc()).offset((payload.page - 1) * payload.size).limit(payload.size).all()
    return {"engine": "mysql_fallback", "total": total, "items": [_doc_payload(item) for item in items]}


@router.post("/documents/reindex")
def reindex_documents(
    request: Request,
    user: User = Depends(require_permission("search.reindex")),
    db: Session = Depends(get_db),
):
    documents = db.query(Document).filter(Document.company_id == user.company_id).limit(1000).all()
    indexed = 0
    for document in documents:
        if index_document(_doc_payload(document)):
            indexed += 1
    write_audit(
        db,
        action="search_reindex_requested",
        module="search",
        user_id=user.identification,
        new_values={"documents_scanned": len(documents), "indexed": indexed},
        request=request,
    )
    db.commit()
    return {"documents_scanned": len(documents), "indexed": indexed, "engine": "opensearch" if indexed else "fallback_noop"}
