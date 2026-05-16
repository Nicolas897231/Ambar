from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import Document, DocumentFile, DocumentHistory, TrdSubseries, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.cache import delete_pattern
from app.services.search import index_document
from app.services.events import publish_event
from app.services.storage import presigned_url, store_file

router = APIRouter(prefix="/documents", tags=["documents"])


class DocumentCreate(BaseModel):
    document_name: str = Field(min_length=3, max_length=200)
    document_type: str = Field(min_length=2, max_length=80)
    metadata: dict = Field(default_factory=dict)
    location_id: int | None = 1
    subseries_id: int | None = None


class DocumentUpdate(BaseModel):
    document_name: str | None = Field(default=None, min_length=3, max_length=200)
    document_type: str | None = Field(default=None, min_length=2, max_length=80)
    metadata: dict | None = None
    status: str | None = None
    subseries_id: int | None = None


class DocumentOut(BaseModel):
    idDocument: int
    document_name: str
    document_type: str
    version: int
    status: str
    owner: str
    location_id: int | None
    subseries_id: int | None
    metadata: dict
    files_count: int


class FileOut(BaseModel):
    idFile: int
    original_name: str
    content_type: str
    checksum: str
    size_bytes: int
    url: str


def _document_out(document: Document) -> DocumentOut:
    return DocumentOut(
        idDocument=document.idDocument,
        document_name=document.document_name,
        document_type=document.document_type,
        version=document.version,
        status=document.status,
        owner=document.ps405Identification,
        location_id=document.location_id,
        subseries_id=document.ps612IdSubseries,
        metadata=document.metadata_json or {},
        files_count=len(document.files),
    )


def _scoped_query(db: Session, user: User):
    query = db.query(Document).filter(Document.company_id == user.company_id)
    if "document.read_all" not in user_permissions(db, user) and user.location_id:
        query = query.filter(Document.location_id == user.location_id)
    return query


@router.get("", response_model=list[DocumentOut])
def list_documents(
    skip: int = 0,
    limit: int = 25,
    q: str | None = None,
    user: User = Depends(require_permission("document.read")),
    db: Session = Depends(get_db),
) -> list[DocumentOut]:
    limit = min(limit, 100)
    query = _scoped_query(db, user)
    if q:
        query = query.filter(Document.document_name.ilike(f"%{q}%"))
    documents = query.order_by(Document.created_at.desc()).offset(skip).limit(limit).all()
    return [_document_out(document) for document in documents]


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
def create_document(
    payload: DocumentCreate,
    request: Request,
    user: User = Depends(require_permission("document.create")),
    db: Session = Depends(get_db),
) -> DocumentOut:
    if payload.subseries_id and not db.get(TrdSubseries, payload.subseries_id):
        raise HTTPException(status_code=422, detail="TRD subseries not found")
    document = Document(
        document_name=payload.document_name,
        document_type=payload.document_type,
        ps405Identification=user.identification,
        company_id=user.company_id,
        location_id=payload.location_id or user.location_id,
        metadata_json=payload.metadata,
        ps612IdSubseries=payload.subseries_id,
    )
    db.add(document)
    db.flush()
    db.add(
        DocumentHistory(
            ps520IdDocument=document.idDocument,
            action="created",
            ps405Identification=user.identification,
            details=payload.model_dump(),
        )
    )
    write_audit(
        db,
        action="document_created",
        module="documents",
        user_id=user.identification,
        entity="document",
        entity_id=document.idDocument,
        new_values=payload.model_dump(),
        request=request,
    )
    db.commit()
    delete_pattern("analytics:*")
    index_document(_document_out(document).model_dump())
    publish_event("document.created", {"document_id": document.idDocument, "user_id": user.identification})
    db.refresh(document)
    return _document_out(document)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(
    document_id: int,
    user: User = Depends(require_permission("document.read")),
    db: Session = Depends(get_db),
) -> DocumentOut:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return _document_out(document)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: int,
    payload: DocumentUpdate,
    request: Request,
    user: User = Depends(require_permission("document.update")),
    db: Session = Depends(get_db),
) -> DocumentOut:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    old_values = {
        "document_name": document.document_name,
        "document_type": document.document_type,
        "status": document.status,
        "metadata": document.metadata_json,
        "subseries_id": document.ps612IdSubseries,
    }
    if payload.document_name is not None:
        document.document_name = payload.document_name
    if payload.document_type is not None:
        document.document_type = payload.document_type
    if payload.metadata is not None:
        document.metadata_json = payload.metadata
    if payload.status is not None:
        document.status = payload.status
    if payload.subseries_id is not None:
        if not db.get(TrdSubseries, payload.subseries_id):
            raise HTTPException(status_code=422, detail="TRD subseries not found")
        document.ps612IdSubseries = payload.subseries_id
    document.version += 1
    db.add(
        DocumentHistory(
            ps520IdDocument=document.idDocument,
            action="updated",
            ps405Identification=user.identification,
            details=payload.model_dump(exclude_unset=True),
        )
    )
    write_audit(
        db,
        action="document_updated",
        module="documents",
        user_id=user.identification,
        entity="document",
        entity_id=document.idDocument,
        old_values=old_values,
        new_values=payload.model_dump(exclude_unset=True),
        request=request,
    )
    db.commit()
    delete_pattern("analytics:*")
    index_document(_document_out(document).model_dump())
    publish_event("document.updated", {"document_id": document.idDocument, "user_id": user.identification})
    db.refresh(document)
    return _document_out(document)


@router.post("/{document_id}/files", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    document_id: int,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(require_permission("document.update")),
    db: Session = Depends(get_db),
) -> FileOut:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    content = await file.read()
    try:
        stored = store_file(company_id=user.company_id, module="documents", file=file, content=content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    document_file = DocumentFile(ps520IdDocument=document.idDocument, **stored)
    document.version += 1
    db.add(document_file)
    db.add(
        DocumentHistory(
            ps520IdDocument=document.idDocument,
            action="file_uploaded",
            ps405Identification=user.identification,
            details={"original_name": stored["original_name"], "checksum": stored["checksum"]},
        )
    )
    write_audit(
        db,
        action="document_file_uploaded",
        module="documents",
        user_id=user.identification,
        entity="document",
        entity_id=document.idDocument,
        new_values={"checksum": stored["checksum"], "content_type": stored["content_type"]},
        request=request,
    )
    db.commit()
    delete_pattern("analytics:*")
    index_document(_document_out(document).model_dump())
    publish_event("document.file_uploaded", {"document_id": document.idDocument, "file": stored["original_name"]})
    db.refresh(document_file)
    return FileOut(
        idFile=document_file.idFile,
        original_name=document_file.original_name,
        content_type=document_file.content_type,
        checksum=document_file.checksum,
        size_bytes=document_file.size_bytes,
        url=presigned_url(document_file.file_path),
    )


@router.get("/{document_id}/files", response_model=list[FileOut])
def list_files(
    document_id: int,
    user: User = Depends(require_permission("document.read")),
    db: Session = Depends(get_db),
) -> list[FileOut]:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return [
        FileOut(
            idFile=item.idFile,
            original_name=item.original_name,
            content_type=item.content_type,
            checksum=item.checksum,
            size_bytes=item.size_bytes,
            url=presigned_url(item.file_path),
        )
        for item in document.files
    ]
