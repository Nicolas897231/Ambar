from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import Document, DocumentFile, DocumentHistory, Expedient, Folder, Foliation, KardexMovement, TrdSubseries, User
from app.db.session import get_db
from app.domains.archives.router import _require_archive_access, allowed_archive_ids
from app.services.audit import write_audit
from app.services.cache import delete_pattern
from app.services.events import publish_event
from app.services.search import index_document
from app.services.storage import ALLOWED_MIME_TYPES, presigned_url, store_file

router = APIRouter(prefix="/documents", tags=["documents"])

DOCUMENT_STATUSES = {"draft", "active", "archived", "transferred", "borrowed", "disposed", "locked", "created", "custody"}


class DocumentCreate(BaseModel):
    document_name: str = Field(min_length=3, max_length=200)
    document_type: str = Field(min_length=2, max_length=80)
    archive_id: int | None = None
    expedient_id: int | None = None
    folder_id: int | None = None
    metadata: dict = Field(default_factory=dict)
    location_id: int | None = 1
    subseries_id: int | None = None
    folio_start: int | None = Field(default=None, ge=1)
    folio_end: int | None = Field(default=None, ge=1)
    physical_location: str | None = None


class DocumentUpdate(BaseModel):
    document_name: str | None = Field(default=None, min_length=3, max_length=200)
    document_type: str | None = Field(default=None, min_length=2, max_length=80)
    metadata: dict | None = None
    status: str | None = None
    subseries_id: int | None = None
    archive_id: int | None = None
    expedient_id: int | None = None
    folder_id: int | None = None
    folio_start: int | None = Field(default=None, ge=1)
    folio_end: int | None = Field(default=None, ge=1)
    physical_location: str | None = None


class DocumentOut(BaseModel):
    idDocument: int
    document_name: str
    document_type: str
    version: int
    status: str
    owner: str
    location_id: int | None
    archive_id: int | None
    expedient_id: int | None
    folder_id: int | None
    subseries_id: int | None
    folio_start: int | None
    folio_end: int | None
    folio_total: int | None
    physical_location: str | None
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
        archive_id=document.ps930IdArchive,
        expedient_id=document.ps950IdExpedient,
        folder_id=document.ps952IdFolder,
        subseries_id=document.ps612IdSubseries,
        folio_start=document.folio_start,
        folio_end=document.folio_end,
        folio_total=document.folio_total,
        physical_location=document.physical_location,
        metadata=document.metadata_json or {},
        files_count=len(document.files),
    )


def _scoped_query(db: Session, user: User):
    query = db.query(Document).filter(Document.company_id == user.company_id)
    permissions = user_permissions(db, user)
    if "*" not in permissions and "archive.manage" not in permissions:
        archive_ids = allowed_archive_ids(db, user)
        if not archive_ids:
            return query.filter(Document.idDocument == -1)
        query = query.filter(Document.ps930IdArchive.in_(archive_ids))
    elif "document.read_all" not in permissions and user.location_id:
        query = query.filter(Document.location_id == user.location_id)
    return query


def _default_expedient_folder(db: Session, archive_id: int) -> tuple[Expedient, Folder]:
    expedient = db.query(Expedient).filter(Expedient.ps930IdArchive == archive_id).order_by(Expedient.idExpedient.asc()).first()
    if not expedient:
        raise HTTPException(status_code=422, detail="Archive has no expedient. Create an expedient first.")
    folder = db.query(Folder).filter(Folder.ps950IdExpedient == expedient.idExpedient).order_by(Folder.idFolder.asc()).first()
    if not folder:
        raise HTTPException(status_code=422, detail="Expedient has no folder. Create a folder first.")
    return expedient, folder


def _resolve_archival_context(db: Session, user: User, payload: DocumentCreate | DocumentUpdate) -> tuple[int, Expedient, Folder]:
    archive_id = payload.archive_id
    if archive_id is None:
        ids = allowed_archive_ids(db, user)
        if not ids:
            raise HTTPException(status_code=403, detail="User has no archive access")
        archive_id = ids[0]
    _require_archive_access(db, user, archive_id, {"operate", "admin"})

    expedient: Expedient | None = db.get(Expedient, payload.expedient_id) if payload.expedient_id else None
    folder: Folder | None = db.get(Folder, payload.folder_id) if payload.folder_id else None
    if not expedient or not folder:
        expedient, folder = _default_expedient_folder(db, archive_id)
    if expedient.ps930IdArchive != archive_id or folder.ps930IdArchive != archive_id or folder.ps950IdExpedient != expedient.idExpedient:
        raise HTTPException(status_code=422, detail="Folder, expedient and archive do not match")
    return archive_id, expedient, folder


def _folio_total(start: int | None, end: int | None) -> int | None:
    if start is None and end is None:
        return None
    if start is None or end is None or end < start:
        raise HTTPException(status_code=422, detail="Invalid foliation range")
    return end - start + 1


@router.get("/file-types")
def supported_file_types(_: User = Depends(require_permission("document.read"))) -> dict:
    return {"mime_types": sorted(ALLOWED_MIME_TYPES)}


@router.get("", response_model=list[DocumentOut])
def list_documents(
    skip: int = 0,
    limit: int = 25,
    q: str | None = None,
    archive_id: int | None = None,
    expedient_id: int | None = None,
    folder_id: int | None = None,
    user: User = Depends(require_permission("document.read")),
    db: Session = Depends(get_db),
) -> list[DocumentOut]:
    limit = min(limit, 100)
    query = _scoped_query(db, user)
    if archive_id:
        _require_archive_access(db, user, archive_id)
        query = query.filter(Document.ps930IdArchive == archive_id)
    if expedient_id:
        query = query.filter(Document.ps950IdExpedient == expedient_id)
    if folder_id:
        query = query.filter(Document.ps952IdFolder == folder_id)
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
    archive_id, expedient, folder = _resolve_archival_context(db, user, payload)
    folio_total = _folio_total(payload.folio_start, payload.folio_end)
    document = Document(
        document_name=payload.document_name,
        document_type=payload.document_type,
        ps405Identification=user.identification,
        company_id=user.company_id,
        location_id=payload.location_id or user.location_id,
        metadata_json=payload.metadata,
        status="active",
        ps612IdSubseries=payload.subseries_id or expedient.ps612IdSubseries,
        ps930IdArchive=archive_id,
        ps950IdExpedient=expedient.idExpedient,
        ps952IdFolder=folder.idFolder,
        folio_start=payload.folio_start,
        folio_end=payload.folio_end,
        folio_total=folio_total,
        physical_location=payload.physical_location or folder.physical_location,
    )
    db.add(document)
    db.flush()
    if folio_total:
        db.add(Foliation(ps520IdDocument=document.idDocument, ps950IdExpedient=expedient.idExpedient, ps952IdFolder=folder.idFolder, folio_start=payload.folio_start or 1, folio_end=payload.folio_end or 1, folio_total=folio_total))
        expedient.folio_count += folio_total
        folder.folio_count += folio_total
    expedient.document_count += 1
    folder.document_count += 1
    db.add(DocumentHistory(ps520IdDocument=document.idDocument, action="created", ps405Identification=user.identification, details=payload.model_dump()))
    db.add(KardexMovement(movement_type="reception", entity_type="document", entity_id=document.idDocument, ps930DestinationArchiveId=archive_id, ps405ActorIdentification=user.identification, status="received", observations="Documento creado en expediente/carpeta"))
    write_audit(db, action="document_created", module="documents", user_id=user.identification, entity="document", entity_id=document.idDocument, new_values=payload.model_dump(), request=request)
    db.commit()
    delete_pattern("analytics:*")
    index_document(_document_out(document).model_dump())
    publish_event("document.created", {"document_id": document.idDocument, "user_id": user.identification, "archive_id": archive_id})
    db.refresh(document)
    return _document_out(document)


@router.get("/{document_id}", response_model=DocumentOut)
def get_document(document_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> DocumentOut:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return _document_out(document)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(document_id: int, payload: DocumentUpdate, request: Request, user: User = Depends(require_permission("document.update")), db: Session = Depends(get_db)) -> DocumentOut:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    old_values = _document_out(document).model_dump()
    if payload.status is not None and payload.status not in DOCUMENT_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid document status")
    if payload.archive_id or payload.expedient_id or payload.folder_id:
        archive_id, expedient, folder = _resolve_archival_context(db, user, payload)
        document.ps930IdArchive = archive_id
        document.ps950IdExpedient = expedient.idExpedient
        document.ps952IdFolder = folder.idFolder
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
    if payload.folio_start is not None or payload.folio_end is not None:
        total = _folio_total(payload.folio_start, payload.folio_end)
        document.folio_start = payload.folio_start
        document.folio_end = payload.folio_end
        document.folio_total = total
    if payload.physical_location is not None:
        document.physical_location = payload.physical_location
    document.version += 1
    db.add(DocumentHistory(ps520IdDocument=document.idDocument, action="updated", ps405Identification=user.identification, details=payload.model_dump(exclude_unset=True)))
    write_audit(db, action="document_updated", module="documents", user_id=user.identification, entity="document", entity_id=document.idDocument, old_values=old_values, new_values=payload.model_dump(exclude_unset=True), request=request)
    db.commit()
    delete_pattern("analytics:*")
    index_document(_document_out(document).model_dump())
    publish_event("document.updated", {"document_id": document.idDocument, "user_id": user.identification})
    db.refresh(document)
    return _document_out(document)


@router.post("/{document_id}/files", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(document_id: int, request: Request, file: UploadFile = File(...), user: User = Depends(require_permission("document.update")), db: Session = Depends(get_db)) -> FileOut:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if document.status == "locked":
        raise HTTPException(status_code=409, detail="Document is locked")
    content = await file.read()
    try:
        stored = store_file(company_id=user.company_id, module="documents", file=file, content=content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    document_file = DocumentFile(ps520IdDocument=document.idDocument, **stored)
    document.version += 1
    db.add(document_file)
    db.add(DocumentHistory(ps520IdDocument=document.idDocument, action="file_uploaded", ps405Identification=user.identification, details={"original_name": stored["original_name"], "checksum": stored["checksum"]}))
    db.add(KardexMovement(movement_type="digital_move", entity_type="document", entity_id=document.idDocument, ps930DestinationArchiveId=document.ps930IdArchive, ps405ActorIdentification=user.identification, status="stored", observations="Archivo digital cargado al repositorio"))
    write_audit(db, action="document_file_uploaded", module="documents", user_id=user.identification, entity="document", entity_id=document.idDocument, new_values={"checksum": stored["checksum"], "content_type": stored["content_type"]}, request=request)
    db.commit()
    delete_pattern("analytics:*")
    index_document(_document_out(document).model_dump())
    publish_event("document.file_uploaded", {"document_id": document.idDocument, "file": stored["original_name"]})
    db.refresh(document_file)
    return FileOut(idFile=document_file.idFile, original_name=document_file.original_name, content_type=document_file.content_type, checksum=document_file.checksum, size_bytes=document_file.size_bytes, url=presigned_url(document_file.file_path))


@router.get("/{document_id}/files", response_model=list[FileOut])
def list_files(document_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> list[FileOut]:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return [FileOut(idFile=item.idFile, original_name=item.original_name, content_type=item.content_type, checksum=item.checksum, size_bytes=item.size_bytes, url=presigned_url(item.file_path)) for item in document.files]
