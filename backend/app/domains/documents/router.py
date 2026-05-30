from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import Archive, Custodianship, Document, DocumentFile, DocumentHistory, DocumentMetadata, DocumentType, Expedient, Folder, Foliation, KardexMovement, PhysicalBox, Shelf, TrdSubseries, User
from app.db.session import get_db
from app.domains.archives.router import _require_archive_access, allowed_archive_ids
from app.services.audit import write_audit
from app.services.cache import delete_pattern
from app.services.events import publish_event
from app.services.search import index_document
from app.services.storage import ALLOWED_MIME_TYPES, presigned_url, store_file

router = APIRouter(prefix="/documents", tags=["documents"])

DOCUMENT_STATUSES = {"draft", "active", "archived", "transferred", "borrowed", "disposed", "locked", "created", "custody"}
DEFAULT_DOCUMENT_TYPES = [
    ("contrato", "Contrato"),
    ("oficio", "Oficio"),
    ("memorando", "Memorando"),
    ("certificacion", "Certificacion"),
    ("certificado", "Certificado"),
    ("informe", "Informe"),
    ("resolucion", "Resolucion"),
    ("historia_laboral", "Historia laboral"),
    ("acta", "Acta"),
    ("soporte", "Soporte"),
    ("factura", "Factura"),
]


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
    version: int | None = None
    trace_id: str | None = None


class DocumentTypeCreate(BaseModel):
    type_code: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=140)
    description: str | None = None
    required_metadata: list[str] = Field(default_factory=list)
    optional_metadata: list[str] = Field(default_factory=list)


class DocumentMetadataUpdate(BaseModel):
    metadata: dict = Field(default_factory=dict)


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


def _ensure_default_document_types(db: Session) -> None:
    existing = {item.type_code for item in db.query(DocumentType).all()}
    for type_code, name in DEFAULT_DOCUMENT_TYPES:
        if type_code not in existing:
            db.add(DocumentType(type_code=type_code, name=name, required_metadata={"items": []}, optional_metadata={"items": []}, status="active"))
    db.flush()


def _document_type(db: Session, type_code: str) -> DocumentType:
    _ensure_default_document_types(db)
    item = db.query(DocumentType).filter(DocumentType.type_code == type_code, DocumentType.status == "active").one_or_none()
    if not item:
        raise HTTPException(status_code=422, detail="Document type is not active in catalog")
    return item


def _required_metadata_keys(document_type: DocumentType) -> list[str]:
    return list((document_type.required_metadata or {}).get("items") or [])


def _sync_metadata(db: Session, document: Document, metadata: dict, required_keys: list[str]) -> None:
    missing = [key for key in required_keys if metadata.get(key) in {None, ""}]
    if missing:
        raise HTTPException(status_code=422, detail=f"Missing required metadata: {', '.join(missing)}")
    document.metadata_json = metadata
    existing = {item.metadata_key: item for item in db.query(DocumentMetadata).filter(DocumentMetadata.ps520IdDocument == document.idDocument).all()}
    for key, value in metadata.items():
        row = existing.get(key)
        if row:
            row.metadata_value = str(value) if value is not None else None
            row.required = key in required_keys
        else:
            db.add(DocumentMetadata(ps520IdDocument=document.idDocument, metadata_key=key, metadata_value=str(value) if value is not None else None, required=key in required_keys))


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
    if not (payload.subseries_id or expedient.ps612IdSubseries):
        raise HTTPException(status_code=422, detail="Document requires TRD subseries through payload or expedient")
    return archive_id, expedient, folder


def _folio_total(start: int | None, end: int | None) -> int | None:
    if start is None and end is None:
        return None
    if start is None or end is None or end < start:
        raise HTTPException(status_code=422, detail="Invalid foliation range")
    return end - start + 1


def _document_location_path(db: Session, document: Document) -> str | None:
    archive = db.get(Archive, document.ps930IdArchive) if document.ps930IdArchive else None
    folder = db.get(Folder, document.ps952IdFolder) if document.ps952IdFolder else None
    box = db.get(PhysicalBox, folder.ps936IdBox) if folder and folder.ps936IdBox else None
    shelf = db.get(Shelf, box.ps934IdShelf) if box and box.ps934IdShelf else None
    shelf_parts = []
    if shelf:
        shelf_parts.extend([shelf.floor, shelf.shelf_code, shelf.module, shelf.bay])
    return " / ".join(part for part in [archive.archive_name if archive else None, *shelf_parts, box.box_code if box else None, folder.folder_code if folder else None, document.document_name] if part)


def _record_document_custody(db: Session, document: Document, custodian: str | None, related_movement_id: int | None = None) -> None:
    if not document.ps930IdArchive:
        return
    for row in db.query(Custodianship).filter(Custodianship.entity_type == "document", Custodianship.entity_id == document.idDocument, Custodianship.is_current.is_(True)).all():
        row.is_current = False
    db.add(
        Custodianship(
            entity_type="document",
            entity_id=document.idDocument,
            ps930IdArchive=document.ps930IdArchive,
            custodian_identification=custodian,
            current_location_path=_document_location_path(db, document),
            status="active",
            source_module="documents",
            related_movement_id=related_movement_id,
            is_current=True,
            metadata_json={"event": "document.created", "expedient_id": document.ps950IdExpedient, "folder_id": document.ps952IdFolder},
        )
    )


@router.get("/file-types")
def supported_file_types(_: User = Depends(require_permission("document.read"))) -> dict:
    return {"mime_types": sorted(ALLOWED_MIME_TYPES)}


@router.get("/types")
def list_document_types(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> list[dict]:
    _ensure_default_document_types(db)
    db.commit()
    return [
        {
            "idDocumentType": item.idDocumentType,
            "type_code": item.type_code,
            "name": item.name,
            "description": item.description,
            "required_metadata": (item.required_metadata or {}).get("items") or [],
            "optional_metadata": (item.optional_metadata or {}).get("items") or [],
            "status": item.status,
        }
        for item in db.query(DocumentType).order_by(DocumentType.name.asc()).all()
    ]


@router.post("/types", status_code=status.HTTP_201_CREATED)
def create_document_type(payload: DocumentTypeCreate, request: Request, user: User = Depends(require_permission("trd.manage")), db: Session = Depends(get_db)) -> dict:
    _ensure_default_document_types(db)
    if db.query(DocumentType).filter(DocumentType.type_code == payload.type_code).first():
        raise HTTPException(status_code=409, detail="Document type already exists")
    item = DocumentType(
        type_code=payload.type_code.strip(),
        name=payload.name.strip(),
        description=payload.description,
        required_metadata={"items": payload.required_metadata},
        optional_metadata={"items": payload.optional_metadata},
        status="active",
    )
    db.add(item)
    db.flush()
    write_audit(db, action="document_type_created", module="documents", user_id=user.identification, entity="document_type", entity_id=item.idDocumentType, new_values=payload.model_dump(), request=request)
    db.commit()
    return {"idDocumentType": item.idDocumentType, "type_code": item.type_code, "name": item.name, "status": item.status}


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
    document_type = _document_type(db, payload.document_type)
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
    _sync_metadata(db, document, payload.metadata, _required_metadata_keys(document_type))
    if folio_total:
        db.add(Foliation(ps520IdDocument=document.idDocument, ps950IdExpedient=expedient.idExpedient, ps952IdFolder=folder.idFolder, folio_start=payload.folio_start or 1, folio_end=payload.folio_end or 1, folio_total=folio_total))
        expedient.folio_count += folio_total
        folder.folio_count += folio_total
    expedient.document_count += 1
    folder.document_count += 1
    archive = _require_archive_access(db, user, archive_id)
    archive.document_count += 1
    db.add(DocumentHistory(ps520IdDocument=document.idDocument, action="created", ps405Identification=user.identification, details=payload.model_dump()))
    movement = KardexMovement(movement_type="document_created", entity_type="document", entity_id=document.idDocument, ps930DestinationArchiveId=archive_id, ps405ActorIdentification=user.identification, status="accepted", observations="Documento creado en expediente/carpeta/TRD")
    db.add(movement)
    db.flush()
    _record_document_custody(db, document, archive.custodian_identification or user.identification, movement.idMovement)
    write_audit(db, action="document_created", module="documents", user_id=user.identification, archive_id=archive_id, entity="document", entity_id=document.idDocument, entity_label=document.document_name, new_values=payload.model_dump(), request=request)
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
    document_type = None
    if payload.document_type is not None:
        document_type = _document_type(db, payload.document_type)
        document.document_type = payload.document_type
    if payload.metadata is not None:
        document_type = document_type or _document_type(db, document.document_type)
        _sync_metadata(db, document, payload.metadata, _required_metadata_keys(document_type))
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
    write_audit(db, action="document_updated", module="documents", user_id=user.identification, archive_id=document.ps930IdArchive, entity="document", entity_id=document.idDocument, entity_label=document.document_name, old_values=old_values, new_values=payload.model_dump(exclude_unset=True), request=request)
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
    if not document.ps930IdArchive or not document.ps950IdExpedient or not document.ps952IdFolder or not document.ps612IdSubseries:
        raise HTTPException(status_code=400, detail="Document has no complete archive, expedient, folder and TRD context")
    content = await file.read()
    try:
        stored = store_file(company_id=user.company_id, module="documents", file=file, content=content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Document repository is unavailable") from exc
    next_version = document.version + 1
    document_file = DocumentFile(ps520IdDocument=document.idDocument, version=next_version, uploaded_by=user.identification, trace_id=getattr(request.state, "request_id", None) or uuid4().hex, **stored)
    document.version += 1
    db.add(document_file)
    db.add(DocumentHistory(ps520IdDocument=document.idDocument, action="file_uploaded", ps405Identification=user.identification, details={"original_name": stored["original_name"], "checksum": stored["checksum"]}))
    db.add(KardexMovement(movement_type="file_uploaded", entity_type="document", entity_id=document.idDocument, ps930DestinationArchiveId=document.ps930IdArchive, ps405ActorIdentification=user.identification, status="stored", observations="Archivo digital cargado al repositorio", metadata_json={"checksum": stored["checksum"], "content_type": stored["content_type"]}))
    write_audit(db, action="document_file_uploaded", module="documents", user_id=user.identification, archive_id=document.ps930IdArchive, entity="document", entity_id=document.idDocument, entity_label=document.document_name, new_values={"checksum": stored["checksum"], "content_type": stored["content_type"]}, request=request)
    db.commit()
    delete_pattern("analytics:*")
    index_document(_document_out(document).model_dump())
    publish_event("document.file_uploaded", {"document_id": document.idDocument, "file": stored["original_name"]})
    db.refresh(document_file)
    return FileOut(idFile=document_file.idFile, original_name=document_file.original_name, content_type=document_file.content_type, checksum=document_file.checksum, size_bytes=document_file.size_bytes, url=presigned_url(document_file.file_path), version=document_file.version, trace_id=document_file.trace_id)


@router.get("/{document_id}/files", response_model=list[FileOut])
def list_files(document_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> list[FileOut]:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return [FileOut(idFile=item.idFile, original_name=item.original_name, content_type=item.content_type, checksum=item.checksum, size_bytes=item.size_bytes, url=presigned_url(item.file_path), version=item.version, trace_id=item.trace_id) for item in document.files]


@router.get("/{document_id}/versions")
def document_versions(document_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> dict:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    history = db.query(DocumentHistory).filter(DocumentHistory.ps520IdDocument == document_id).order_by(DocumentHistory.action_date.desc()).all()
    files = db.query(DocumentFile).filter(DocumentFile.ps520IdDocument == document_id).order_by(DocumentFile.uploaded_at.desc()).all()
    return {
        "current_version": document.version,
        "history": [{"action": item.action, "user": item.ps405Identification, "date": item.action_date, "details": item.details} for item in history],
        "files": [{"idFile": item.idFile, "version": item.version, "original_name": item.original_name, "checksum": item.checksum, "uploaded_at": item.uploaded_at, "trace_id": item.trace_id} for item in files],
    }


@router.get("/{document_id}/metadata")
def document_metadata(document_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> dict:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    document_type = _document_type(db, document.document_type)
    rows = db.query(DocumentMetadata).filter(DocumentMetadata.ps520IdDocument == document_id).order_by(DocumentMetadata.metadata_key.asc()).all()
    return {
        "document_id": document_id,
        "document_type": document.document_type,
        "required_metadata": _required_metadata_keys(document_type),
        "optional_metadata": (document_type.optional_metadata or {}).get("items") or [],
        "metadata": document.metadata_json or {},
        "rows": [{"key": item.metadata_key, "value": item.metadata_value, "required": item.required} for item in rows],
    }


@router.put("/{document_id}/metadata", response_model=DocumentOut)
def update_document_metadata(document_id: int, payload: DocumentMetadataUpdate, request: Request, user: User = Depends(require_permission("document.update")), db: Session = Depends(get_db)) -> DocumentOut:
    document = _scoped_query(db, user).filter(Document.idDocument == document_id).one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    old_values = document.metadata_json or {}
    document_type = _document_type(db, document.document_type)
    _sync_metadata(db, document, payload.metadata, _required_metadata_keys(document_type))
    document.version += 1
    db.add(DocumentHistory(ps520IdDocument=document.idDocument, action="metadata_updated", ps405Identification=user.identification, details=payload.metadata))
    write_audit(db, action="document_metadata_updated", module="documents", user_id=user.identification, archive_id=document.ps930IdArchive, entity="document", entity_id=document.idDocument, entity_label=document.document_name, old_values=old_values, new_values=payload.metadata, request=request)
    db.commit()
    db.refresh(document)
    return _document_out(document)
