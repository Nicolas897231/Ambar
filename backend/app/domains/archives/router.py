from datetime import UTC, datetime
from html import escape
from io import BytesIO
from unicodedata import normalize
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import (
    Archive,
    ArchiveUser,
    AuditLog,
    Document,
    DocumentFile,
    DocumentLoan,
    Expedient,
    Folder,
    Foliation,
    InventoryFuid,
    KardexMovement,
    MovementTrace,
    PhysicalBox,
    Shelf,
    TransferBatch,
    TransferBatchItem,
    TrdSeries,
    TrdSubseries,
    User,
)
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.operational import create_operational_task, notify_action, resolve_notifications, resolve_related_tasks
from app.services.storage import presigned_url

router = APIRouter(prefix="/archives", tags=["archives"])


class ArchiveCreate(BaseModel):
    archive_code: str = Field(min_length=2, max_length=60)
    archive_name: str = Field(min_length=3, max_length=180)
    archive_type: str = Field(pattern="^(gestion|central|historico|satelite)$")
    location_id: int | None = 1
    description: str | None = None
    responsible_identification: str | None = None
    custodian_identification: str | None = None
    capacity_units: int = 0
    physical_location: str | None = None
    metadata: dict = Field(default_factory=dict)


class ArchiveOut(BaseModel):
    idArchive: int
    archive_code: str
    archive_name: str
    archive_type: str
    location_id: int | None
    description: str | None
    responsible_identification: str | None
    custodian_identification: str | None
    capacity_units: int
    physical_location: str | None
    status: str
    box_count: int
    expedient_count: int
    document_count: int
    metadata: dict


class ArchiveAccessCreate(BaseModel):
    identification: str
    access_level: str = Field(default="read", pattern="^(read|operate|admin)$")


class ExpedientCreate(BaseModel):
    expedient_code: str = Field(min_length=2, max_length=80)
    expedient_name: str = Field(min_length=3, max_length=220)
    expedient_type: str = Field(default="administrativo", max_length=80)
    archive_id: int
    series_id: int
    subseries_id: int
    responsible_identification: str | None = None
    physical_location: str | None = None
    digital_location: str | None = None
    metadata: dict = Field(default_factory=dict)


class FolderCreate(BaseModel):
    folder_code: str = Field(min_length=1, max_length=80)
    folder_name: str = Field(min_length=3, max_length=220)
    expedient_id: int
    box_id: int | None = None
    physical_location: str | None = None
    metadata: dict = Field(default_factory=dict)


class ShelfCreate(BaseModel):
    archive_id: int
    shelf_code: str = Field(min_length=1, max_length=60)
    shelf_name: str = Field(min_length=2, max_length=160)
    capacity_boxes: int = 0
    physical_location: str | None = None


class BoxCreate(BaseModel):
    archive_id: int
    shelf_id: int | None = None
    box_code: str = Field(min_length=1, max_length=60)
    box_name: str | None = None
    capacity_folders: int = 0


class ShelfUpdate(BaseModel):
    shelf_name: str | None = Field(default=None, min_length=2, max_length=160)
    capacity_boxes: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(active|full|available|reserved|inactive|moved|archived|damaged)$")
    physical_location: str | None = None


class BoxUpdate(BaseModel):
    box_name: str | None = None
    capacity_folders: int | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern="^(active|full|available|reserved|inactive|moved|archived|damaged)$")


class BoxMove(BaseModel):
    shelf_id: int
    observation: str | None = None


class FolderLocationPayload(BaseModel):
    box_id: int
    observation: str | None = None


class FoliationCreate(BaseModel):
    document_id: int
    expedient_id: int
    folder_id: int
    folio_start: int = Field(ge=1)
    folio_end: int = Field(ge=1)
    electronic_folios: int = Field(default=0, ge=0)
    annexes: str | None = None


class MovementCreate(BaseModel):
    movement_type: str = Field(pattern="^(transfer|loan|return|reception|rejection|location_change|digital_move|document_created|file_uploaded|foliation_validated|fuid_generated)$")
    entity_type: str = Field(pattern="^(document|folder|box|expedient|batch)$")
    entity_id: int
    origin_archive_id: int | None = None
    destination_archive_id: int | None = None
    custodian_from: str | None = None
    custodian_to: str | None = None
    observations: str | None = None
    metadata: dict = Field(default_factory=dict)


class MovementDecision(BaseModel):
    status: str = Field(pattern="^(accepted|rejected|received|returned|partially_received)$")
    reason: str | None = None
    observations: str | None = None


class LoanCreate(BaseModel):
    entity_type: str = Field(default="folder", pattern="^(document|folder|box|expedient)$")
    entity_id: int
    archive_id: int
    requested_by: str = Field(min_length=2, max_length=160)
    requester_identification: str | None = None
    requester_area: str | None = None
    requester_contact: str | None = None
    due_at: datetime | None = None
    reason: str | None = None
    observations: str | None = None
    delivery_evidence_url: str | None = None


class LoanReturn(BaseModel):
    observations: str | None = None
    evidence: dict = Field(default_factory=dict)
    return_evidence_url: str | None = None


class LoanCancel(BaseModel):
    reason: str | None = None
    observations: str | None = None


class LoanEvidencePayload(BaseModel):
    observation: str | None = None
    evidence_url: str | None = None


class ExpedientClosePayload(BaseModel):
    observation: str | None = None


class FuidEvidencePayload(BaseModel):
    observation: str | None = None
    evidence_url: str | None = None
    result: str | None = Field(default=None, pattern="^(accepted|partially_received|rejected)$")


class FuidRegeneratePayload(BaseModel):
    reason: str | None = None


def _archive_out(item: Archive) -> ArchiveOut:
    return ArchiveOut(
        idArchive=item.idArchive,
        archive_code=item.archive_code,
        archive_name=item.archive_name,
        archive_type=item.archive_type,
        location_id=item.ps700IdLocation,
        description=item.description,
        responsible_identification=item.responsible_identification,
        custodian_identification=item.custodian_identification,
        capacity_units=item.capacity_units,
        physical_location=item.physical_location,
        status=item.status,
        box_count=item.box_count,
        expedient_count=item.expedient_count,
        document_count=item.document_count,
        metadata=item.metadata_json or {},
    )


def _is_global(user: User, db: Session) -> bool:
    permissions = user_permissions(db, user)
    return "*" in permissions or "archive.manage" in permissions


def allowed_archive_ids(db: Session, user: User) -> list[int]:
    if _is_global(user, db):
        return [row.idArchive for row in db.query(Archive.idArchive).all()]
    return [
        row.ps930IdArchive
        for row in db.query(ArchiveUser).filter(ArchiveUser.ps405Identification == user.identification).all()
    ]


def _require_archive_access(db: Session, user: User, archive_id: int, levels: set[str] | None = None) -> Archive:
    archive = db.get(Archive, archive_id)
    if not archive or archive.status != "active":
        raise HTTPException(status_code=404, detail="Archive not found")
    if _is_global(user, db):
        return archive
    access = db.query(ArchiveUser).filter(
        ArchiveUser.ps930IdArchive == archive_id,
        ArchiveUser.ps405Identification == user.identification,
    ).one_or_none()
    if not access or (levels and access.access_level not in levels):
        write_audit(
            db,
            action="archive_access_denied",
            module="security",
            user_id=user.identification,
            archive_id=archive_id,
            entity="archive",
            entity_id=archive_id,
            result="denied",
            severity="critical",
            new_values={"required_levels": sorted(levels) if levels else None},
        )
        db.commit()
        raise HTTPException(status_code=403, detail="Archive access denied")
    return archive


def _trace(db: Session, movement_id: int, action: str, user: User, request: Request, notes: str | None = None) -> None:
    db.add(
        MovementTrace(
            ps960IdMovement=movement_id,
            action=action,
            ps405Identification=user.identification,
            ip_address=request.client.host if request.client else None,
            notes=notes,
        )
    )


def _notify(db: Session, identification: str | None, module: str, message: str, action_url: str | None) -> None:
    notify_action(
        db,
        user_id=identification,
        module=module,
        title=message,
        message=message,
        priority="normal",
        notification_type="system_info",
        action_label="Abrir",
        action_url=action_url,
    )


def _movement_archive_for_entity(db: Session, entity_type: str, entity_id: int) -> int:
    if entity_type == "document":
        item = db.get(Document, entity_id)
        if not item or not item.ps930IdArchive or not item.ps950IdExpedient or not item.ps952IdFolder:
            raise HTTPException(status_code=400, detail="Document has no complete archival context")
        return item.ps930IdArchive
    if entity_type == "folder":
        item = db.get(Folder, entity_id)
        if not item:
            raise HTTPException(status_code=404, detail="Folder not found")
        return item.ps930IdArchive
    if entity_type == "expedient":
        item = db.get(Expedient, entity_id)
        if not item:
            raise HTTPException(status_code=404, detail="Expedient not found")
        return item.ps930IdArchive
    if entity_type == "box":
        item = db.get(PhysicalBox, entity_id)
        if not item:
            raise HTTPException(status_code=404, detail="Box not found")
        return item.ps930IdArchive
    return 0


def _apply_custody_change(db: Session, movement: KardexMovement) -> None:
    if not movement.ps930DestinationArchiveId:
        return
    destination = movement.ps930DestinationArchiveId
    if movement.entity_type == "document":
        document = db.get(Document, movement.entity_id)
        if document:
            document.ps930IdArchive = destination
            document.status = "active"
    elif movement.entity_type == "folder":
        folder = db.get(Folder, movement.entity_id)
        if folder:
            folder.ps930IdArchive = destination
            folder.status = "active"
            for document in db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).all():
                document.ps930IdArchive = destination
    elif movement.entity_type == "expedient":
        expedient = db.get(Expedient, movement.entity_id)
        if expedient:
            expedient.ps930IdArchive = destination
            expedient.status = "active"
            db.query(Folder).filter(Folder.ps950IdExpedient == expedient.idExpedient).update({"ps930IdArchive": destination})
            db.query(Document).filter(Document.ps950IdExpedient == expedient.idExpedient).update({"ps930IdArchive": destination})
    elif movement.entity_type == "box":
        box = db.get(PhysicalBox, movement.entity_id)
        if box:
            box.ps930IdArchive = destination


@router.get("", response_model=list[ArchiveOut])
def list_archives(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> list[ArchiveOut]:
    ids = allowed_archive_ids(db, user)
    if not ids:
        return []
    return [_archive_out(item) for item in db.query(Archive).filter(Archive.idArchive.in_(ids)).order_by(Archive.archive_name.asc()).all()]


@router.post("", response_model=ArchiveOut, status_code=status.HTTP_201_CREATED)
def create_archive(payload: ArchiveCreate, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)) -> ArchiveOut:
    if db.query(Archive).filter(Archive.archive_code == payload.archive_code).first():
        raise HTTPException(status_code=409, detail="Archive code already exists")
    archive = Archive(
        archive_code=payload.archive_code,
        archive_name=payload.archive_name,
        archive_type=payload.archive_type,
        ps700IdLocation=payload.location_id,
        description=payload.description,
        responsible_identification=payload.responsible_identification,
        custodian_identification=payload.custodian_identification,
        capacity_units=payload.capacity_units,
        physical_location=payload.physical_location,
        metadata_json=payload.metadata,
    )
    db.add(archive)
    db.flush()
    db.add(ArchiveUser(ps930IdArchive=archive.idArchive, ps405Identification=user.identification, access_level="admin"))
    write_audit(db, action="archive_created", module="archives", user_id=user.identification, entity="archive", entity_id=archive.idArchive, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(archive)
    return _archive_out(archive)


@router.post("/{archive_id}/users", status_code=status.HTTP_201_CREATED)
def grant_archive_access(archive_id: int, payload: ArchiveAccessCreate, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)) -> dict:
    _require_archive_access(db, user, archive_id, {"admin"})
    if not db.get(User, payload.identification):
        raise HTTPException(status_code=404, detail="User not found")
    access = db.query(ArchiveUser).filter(ArchiveUser.ps930IdArchive == archive_id, ArchiveUser.ps405Identification == payload.identification).one_or_none()
    if access:
        access.access_level = payload.access_level
    else:
        db.add(ArchiveUser(ps930IdArchive=archive_id, ps405Identification=payload.identification, access_level=payload.access_level))
    write_audit(db, action="archive_access_granted", module="archives", user_id=user.identification, entity="archive", entity_id=archive_id, new_values=payload.model_dump(), request=request)
    db.commit()
    return {"ok": True}


@router.get("/dashboard")
def custody_dashboard(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> dict:
    ids = allowed_archive_ids(db, user)
    if not ids:
        return {"archives": 0, "documents": 0, "expedients": 0, "pending_movements": 0, "overdue_loans": 0, "by_archive": []}
    now = datetime.now(UTC)
    by_archive = []
    for archive in db.query(Archive).filter(Archive.idArchive.in_(ids)).order_by(Archive.archive_name.asc()).all():
        by_archive.append({
            "idArchive": archive.idArchive,
            "archive_name": archive.archive_name,
            "documents": db.query(Document).filter(Document.ps930IdArchive == archive.idArchive).count(),
            "expedients": db.query(Expedient).filter(Expedient.ps930IdArchive == archive.idArchive).count(),
            "boxes": db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive == archive.idArchive).count(),
        })
    return {
        "archives": len(ids),
        "documents": db.query(Document).filter(Document.ps930IdArchive.in_(ids)).count(),
        "expedients": db.query(Expedient).filter(Expedient.ps930IdArchive.in_(ids)).count(),
        "pending_movements": db.query(KardexMovement).filter(or_(KardexMovement.ps930OriginArchiveId.in_(ids), KardexMovement.ps930DestinationArchiveId.in_(ids)), KardexMovement.status.in_(["pending", "in_transit"])).count(),
        "overdue_loans": db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive.in_(ids), DocumentLoan.status == "active", DocumentLoan.due_at < now).count(),
        "by_archive": by_archive,
    }


@router.get("/expedients")
def list_expedients(archive_id: int | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    query = db.query(Expedient).filter(Expedient.ps930IdArchive.in_(ids))
    if archive_id:
        _require_archive_access(db, user, archive_id)
        query = query.filter(Expedient.ps930IdArchive == archive_id)
    return query.order_by(Expedient.created_at.desc()).all()


@router.post("/expedients", status_code=status.HTTP_201_CREATED)
def create_expedient(payload: ExpedientCreate, request: Request, user: User = Depends(require_permission("document.create")), db: Session = Depends(get_db)):
    archive = _require_archive_access(db, user, payload.archive_id, {"operate", "admin"})
    series = db.get(TrdSeries, payload.series_id)
    subseries = db.get(TrdSubseries, payload.subseries_id)
    if not series:
        raise HTTPException(status_code=422, detail="TRD series not found")
    if not subseries:
        raise HTTPException(status_code=422, detail="TRD subseries not found")
    if subseries.ps610IdSeries != series.idSeries:
        raise HTTPException(status_code=422, detail="TRD series and subseries do not match")
    item = Expedient(
        expedient_code=payload.expedient_code,
        expedient_name=payload.expedient_name,
        expedient_type=payload.expedient_type,
        ps930IdArchive=archive.idArchive,
        ps610IdSeries=payload.series_id,
        ps612IdSubseries=payload.subseries_id,
        responsible_identification=payload.responsible_identification or user.identification,
        physical_location=payload.physical_location,
        digital_location=payload.digital_location,
        metadata_json=payload.metadata,
    )
    db.add(item)
    archive.expedient_count += 1
    db.flush()
    movement = KardexMovement(
        movement_type="document_created",
        entity_type="expedient",
        entity_id=item.idExpedient,
        ps930DestinationArchiveId=archive.idArchive,
        ps405ActorIdentification=user.identification,
        custodian_to=archive.custodian_identification,
        status="accepted",
        observations="Expediente vivo creado y asociado a TRD",
        metadata_json={"series_id": payload.series_id, "subseries_id": payload.subseries_id},
    )
    db.add(movement)
    db.flush()
    _trace(db, movement.idMovement, "expedient_created", user, request, item.expedient_code)
    write_audit(db, action="expedient_created", module="archives", user_id=user.identification, entity="expedient", entity_id=item.idExpedient, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


def _get_expedient_for_user(db: Session, user: User, expedient_id: int, levels: set[str] | None = None) -> Expedient:
    expedient = db.get(Expedient, expedient_id)
    if not expedient:
        raise HTTPException(status_code=404, detail="Expedient not found")
    _require_archive_access(db, user, expedient.ps930IdArchive, levels)
    return expedient


def _normalize_doc_type(value: str | None) -> str:
    normalized = normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii")
    return normalized.lower().replace("_", " ").replace("-", " ").strip()


def _expedient_required_documents(expedient: Expedient) -> list[str]:
    metadata = expedient.metadata_json or {}
    configured = metadata.get("required_document_types")
    if isinstance(configured, list) and configured:
        return [str(item) for item in configured]
    if _normalize_doc_type(expedient.expedient_type) == "laboral":
        return ["hoja de vida", "cedula", "contrato", "afiliacion eps", "afiliacion arl"]
    return []


def _expedient_documents(db: Session, expedient_id: int) -> list[Document]:
    return db.query(Document).filter(Document.ps950IdExpedient == expedient_id).order_by(Document.ps952IdFolder.asc(), Document.idDocument.asc()).all()


def _expedient_folders(db: Session, expedient_id: int) -> list[Folder]:
    return db.query(Folder).filter(Folder.ps950IdExpedient == expedient_id).order_by(Folder.folder_code.asc()).all()


def _missing_documents(expedient: Expedient, documents: list[Document]) -> list[str]:
    existing = {_normalize_doc_type(document.document_type) for document in documents}
    existing.update(_normalize_doc_type(document.document_name) for document in documents)
    missing = []
    for required in _expedient_required_documents(expedient):
        normalized = _normalize_doc_type(required)
        if not any(normalized in item or item in normalized for item in existing):
            missing.append(required)
    return missing


def _foliation_report(documents: list[Document]) -> dict:
    unfoliated = [
        {"idDocument": item.idDocument, "document_name": item.document_name, "folder_id": item.ps952IdFolder}
        for item in documents
        if not item.folio_start or not item.folio_end or not item.folio_total
    ]
    ranges = sorted(
        [
            {"document_id": item.idDocument, "document_name": item.document_name, "start": item.folio_start, "end": item.folio_end, "total": item.folio_total, "folder_id": item.ps952IdFolder}
            for item in documents
            if item.folio_start and item.folio_end
        ],
        key=lambda item: (item["start"], item["end"]),
    )
    duplicates: list[dict] = []
    gaps: list[dict] = []
    previous_end: int | None = None
    previous_document: dict | None = None
    for item in ranges:
        if previous_end is not None:
            if item["start"] <= previous_end:
                duplicates.append({"document_id": item["document_id"], "folio_start": item["start"], "folio_end": item["end"], "overlaps_with": previous_document["document_id"] if previous_document else None})
            elif item["start"] > previous_end + 1:
                gaps.append({"from": previous_end + 1, "to": item["start"] - 1})
        if previous_end is None or item["end"] > previous_end:
            previous_end = item["end"]
            previous_document = item
    if duplicates:
        status_value = "error"
    elif gaps or unfoliated:
        status_value = "warning"
    else:
        status_value = "complete"
    return {"status": status_value, "ranges": ranges, "unfoliated": unfoliated, "duplicates": duplicates, "gaps": gaps, "total_folios": sum(item["total"] or 0 for item in ranges)}


def _expedient_related_loans(db: Session, expedient_id: int, folders: list[Folder], documents: list[Document]) -> list[DocumentLoan]:
    folder_ids = [item.idFolder for item in folders]
    document_ids = [item.idDocument for item in documents]
    conditions = [((DocumentLoan.entity_type == "expedient") & (DocumentLoan.entity_id == expedient_id))]
    if folder_ids:
        conditions.append((DocumentLoan.entity_type == "folder") & DocumentLoan.entity_id.in_(folder_ids))
    if document_ids:
        conditions.append((DocumentLoan.entity_type == "document") & DocumentLoan.entity_id.in_(document_ids))
    return db.query(DocumentLoan).filter(or_(*conditions)).order_by(DocumentLoan.created_at.desc()).all()


def _expedient_related_transfers(db: Session, expedient_id: int, folders: list[Folder], documents: list[Document]) -> list[TransferBatchItem]:
    folder_ids = [item.idFolder for item in folders]
    document_ids = [item.idDocument for item in documents]
    box_ids = [item.ps936IdBox for item in folders if item.ps936IdBox]
    conditions = [((TransferBatchItem.entity_type == "expedient") & (TransferBatchItem.entity_id == expedient_id))]
    if folder_ids:
        conditions.append((TransferBatchItem.entity_type == "folder") & TransferBatchItem.entity_id.in_(folder_ids))
    if document_ids:
        conditions.append((TransferBatchItem.entity_type == "document") & TransferBatchItem.entity_id.in_(document_ids))
    if box_ids:
        conditions.append((TransferBatchItem.entity_type == "box") & TransferBatchItem.entity_id.in_(box_ids))
    return db.query(TransferBatchItem).filter(or_(*conditions)).order_by(TransferBatchItem.idBatchItem.desc()).all()


def _check_item(key: str, label: str, status_value: str, message: str, critical: bool = True) -> dict:
    return {"key": key, "label": label, "status": status_value, "message": message, "critical": critical}


def _expedient_compliance(db: Session, expedient: Expedient) -> dict:
    folders = _expedient_folders(db, expedient.idExpedient)
    documents = _expedient_documents(db, expedient.idExpedient)
    missing = _missing_documents(expedient, documents)
    foliation = _foliation_report(documents)
    loans = _expedient_related_loans(db, expedient.idExpedient, folders, documents)
    transfers = _expedient_related_transfers(db, expedient.idExpedient, folders, documents)
    active_loans = [item for item in loans if item.status in ACTIVE_LOAN_STATUSES]
    pending_transfers = [item for item in transfers if item.status in {"pending", "pending_review", "with_inconsistency", "partially_received"}]
    fuid = db.query(InventoryFuid).filter(InventoryFuid.ps950IdExpedient == expedient.idExpedient).order_by(InventoryFuid.created_at.desc()).first()
    kardex_count = db.query(KardexMovement).filter(or_(
        (KardexMovement.entity_type == "expedient") & (KardexMovement.entity_id == expedient.idExpedient),
        KardexMovement.related_expedient_id == expedient.idExpedient,
    )).count()
    location_complete = bool(expedient.digital_location or expedient.physical_location or (folders and all(folder.ps936IdBox or folder.physical_location for folder in folders)))
    checklist = [
        _check_item("archive", "Archivo asignado", "complete" if expedient.ps930IdArchive else "error", f"Archivo #{expedient.ps930IdArchive}" if expedient.ps930IdArchive else "El expediente no tiene archivo."),
        _check_item("trd", "Serie y subserie TRD", "complete" if expedient.ps610IdSeries and expedient.ps612IdSubseries else "error", "TRD asignada." if expedient.ps610IdSeries and expedient.ps612IdSubseries else "Falta serie o subserie TRD."),
        _check_item("folders", "Carpetas", "complete" if folders else "error", f"{len(folders)} carpetas registradas." if folders else "El expediente no tiene carpetas."),
        _check_item("documents", "Documentos", "complete" if documents else "error", f"{len(documents)} documentos asociados." if documents else "El expediente no tiene documentos."),
        _check_item("missing_documents", "Documentos obligatorios", "complete" if not missing else "warning", "Sin faltantes obligatorios." if not missing else f"Faltan {len(missing)} documentos: {', '.join(missing)}.", critical=False),
        _check_item("foliation", "Foliacion", foliation["status"], "Foliacion integra." if foliation["status"] == "complete" else "Hay documentos sin foliar, saltos o duplicados."),
        _check_item("loans", "Prestamos activos", "complete" if not active_loans else "error", "Sin prestamos activos." if not active_loans else f"Hay {len(active_loans)} prestamos activos o vencidos."),
        _check_item("transfers", "Transferencias pendientes", "complete" if not pending_transfers else "error", "Sin transferencias pendientes." if not pending_transfers else f"Hay {len(pending_transfers)} items de transferencia pendientes."),
        _check_item("location", "Ubicacion fisica o digital", "complete" if location_complete else "error", "Ubicacion definida." if location_complete else "La ubicacion fisica o digital es requerida para cierre."),
        _check_item("fuid", "FUID", "complete" if fuid else "pending", "FUID generado." if fuid else "FUID pendiente.", critical=False),
        _check_item("kardex", "Kardex", "complete" if kardex_count else "warning", f"{kardex_count} movimientos Kardex." if kardex_count else "Sin movimientos Kardex.", critical=False),
    ]
    critical_errors = [item for item in checklist if item["critical"] and item["status"] == "error"]
    warnings = [item for item in checklist if item["status"] in {"warning", "pending"}]
    if critical_errors:
        status_value = "error"
        expedient_status = "incomplete"
    elif warnings:
        status_value = "warning"
        expedient_status = "under_review"
    else:
        status_value = "complete"
        expedient_status = "ready_to_close"
    return {
        "expedient_id": expedient.idExpedient,
        "status": status_value,
        "suggested_expedient_status": expedient_status,
        "ready_to_close": not critical_errors,
        "critical_errors": critical_errors,
        "warnings": warnings,
        "checklist": checklist,
        "missing_documents": missing,
        "foliation": foliation,
        "active_loans": len(active_loans),
        "pending_transfers": len(pending_transfers),
        "fuid_id": fuid.idFuid if fuid else None,
    }


def _expedient_detail_payload(db: Session, expedient: Expedient) -> dict:
    archive = db.get(Archive, expedient.ps930IdArchive)
    series = db.get(TrdSeries, expedient.ps610IdSeries) if expedient.ps610IdSeries else None
    subseries = db.get(TrdSubseries, expedient.ps612IdSubseries) if expedient.ps612IdSubseries else None
    folders = _expedient_folders(db, expedient.idExpedient)
    documents = _expedient_documents(db, expedient.idExpedient)
    compliance = _expedient_compliance(db, expedient)
    return {
        "idExpedient": expedient.idExpedient,
        "expedient_code": expedient.expedient_code,
        "expedient_name": expedient.expedient_name,
        "expedient_type": expedient.expedient_type,
        "status": expedient.status,
        "archive_id": expedient.ps930IdArchive,
        "archive_name": archive.archive_name if archive else None,
        "series_id": expedient.ps610IdSeries,
        "series": {"idSeries": series.idSeries, "code": series.code, "name": series.name} if series else None,
        "subseries_id": expedient.ps612IdSubseries,
        "subseries": {"idSubseries": subseries.idSubseries, "name": subseries.name, "retention_years": subseries.retention_years} if subseries else None,
        "responsible_identification": expedient.responsible_identification,
        "custodian": archive.custodian_identification if archive else None,
        "physical_location": expedient.physical_location,
        "digital_location": expedient.digital_location,
        "folders_count": len(folders),
        "documents_count": len(documents),
        "folios_count": sum(document.folio_total or 0 for document in documents),
        "compliance_status": compliance["status"],
        "ready_to_close": compliance["ready_to_close"],
        "closure": (expedient.metadata_json or {}).get("closure"),
        "metadata": expedient.metadata_json or {},
        "created_at": expedient.created_at,
        "updated_at": expedient.updated_at,
    }


def _shelf_out(db: Session, shelf: Shelf) -> dict:
    boxes_count = db.query(PhysicalBox).filter(PhysicalBox.ps934IdShelf == shelf.idShelf).count()
    occupancy = round((boxes_count / shelf.capacity_boxes) * 100, 2) if shelf.capacity_boxes else 0
    return {
        "idShelf": shelf.idShelf,
        "archive_id": shelf.ps930IdArchive,
        "shelf_code": shelf.shelf_code,
        "shelf_name": shelf.shelf_name,
        "capacity_boxes": shelf.capacity_boxes,
        "current_boxes": boxes_count,
        "occupancy_percent": occupancy,
        "status": "full" if shelf.capacity_boxes and boxes_count >= shelf.capacity_boxes else shelf.status,
        "physical_location": shelf.physical_location,
        "created_at": shelf.created_at,
        "updated_at": shelf.updated_at,
    }


def _box_out(db: Session, box: PhysicalBox) -> dict:
    folders_count = db.query(Folder).filter(Folder.ps936IdBox == box.idBox).count()
    documents_count = db.query(Document).join(Folder, Document.ps952IdFolder == Folder.idFolder).filter(Folder.ps936IdBox == box.idBox).count()
    shelf = db.get(Shelf, box.ps934IdShelf) if box.ps934IdShelf else None
    archive = db.get(Archive, box.ps930IdArchive)
    occupancy = round((folders_count / box.capacity_folders) * 100, 2) if box.capacity_folders else 0
    status_value = "full" if box.capacity_folders and folders_count >= box.capacity_folders else box.status
    return {
        "idBox": box.idBox,
        "archive_id": box.ps930IdArchive,
        "archive_name": archive.archive_name if archive else None,
        "shelf_id": box.ps934IdShelf,
        "shelf_code": shelf.shelf_code if shelf else None,
        "box_code": box.box_code,
        "box_name": box.box_name,
        "capacity_folders": box.capacity_folders,
        "current_folders": folders_count,
        "current_documents": documents_count,
        "occupancy_percent": occupancy,
        "status": status_value,
        "location_path": _physical_location_path(db, "box", box.idBox),
        "created_at": box.created_at,
        "updated_at": box.updated_at,
    }


def _physical_location_path(db: Session, entity_type: str, entity_id: int) -> str | None:
    archive: Archive | None = None
    shelf: Shelf | None = None
    box: PhysicalBox | None = None
    folder: Folder | None = None
    document: Document | None = None
    if entity_type == "box":
        box = db.get(PhysicalBox, entity_id)
        if not box:
            return None
        archive = db.get(Archive, box.ps930IdArchive)
        shelf = db.get(Shelf, box.ps934IdShelf) if box.ps934IdShelf else None
    elif entity_type == "folder":
        folder = db.get(Folder, entity_id)
        if not folder:
            return None
        archive = db.get(Archive, folder.ps930IdArchive)
        box = db.get(PhysicalBox, folder.ps936IdBox) if folder.ps936IdBox else None
        shelf = db.get(Shelf, box.ps934IdShelf) if box and box.ps934IdShelf else None
    elif entity_type == "document":
        document = db.get(Document, entity_id)
        if not document:
            return None
        archive = db.get(Archive, document.ps930IdArchive) if document.ps930IdArchive else None
        folder = db.get(Folder, document.ps952IdFolder) if document.ps952IdFolder else None
        box = db.get(PhysicalBox, folder.ps936IdBox) if folder and folder.ps936IdBox else None
        shelf = db.get(Shelf, box.ps934IdShelf) if box and box.ps934IdShelf else None
    elif entity_type == "expedient":
        expedient = db.get(Expedient, entity_id)
        if not expedient:
            return None
        archive = db.get(Archive, expedient.ps930IdArchive)
        folders = _expedient_folders(db, expedient.idExpedient)
        paths = [_physical_location_path(db, "folder", item.idFolder) for item in folders if item.ps936IdBox]
        return " | ".join(path for path in paths if path) or f"{archive.archive_name if archive else 'Archivo'} / {expedient.physical_location or 'ubicacion pendiente'}"
    parts = [archive.archive_name if archive else None, shelf.shelf_code if shelf else None, box.box_code if box else None, folder.folder_code if folder else None, document.document_name if document else None]
    return " / ".join(part for part in parts if part)


def _location_movement(db: Session, request: Request, user: User, *, movement_type: str, entity_type: str, entity_id: int, archive_id: int, previous: str | None, current: str | None, observation: str | None = None) -> KardexMovement:
    movement = KardexMovement(
        movement_type=movement_type,
        entity_type=entity_type,
        entity_id=entity_id,
        ps930OriginArchiveId=archive_id,
        ps930DestinationArchiveId=archive_id,
        ps405ActorIdentification=user.identification,
        previous_status=previous,
        status="accepted",
        observations=observation or f"Ubicacion actualizada: {current}",
        metadata_json={"origin_location": previous, "destination_location": current},
    )
    if entity_type == "folder":
        movement.related_folder_id = entity_id
    elif entity_type == "document":
        movement.related_document_id = entity_id
    elif entity_type == "expedient":
        movement.related_expedient_id = entity_id
    elif entity_type == "box":
        movement.related_box_id = entity_id
    db.add(movement)
    db.flush()
    _trace(db, movement.idMovement, movement_type, user, request, observation)
    return movement


ACTIVE_LOAN_STATUSES = {"active", "due_today", "overdue"}
TERMINAL_TRANSFER_ITEM_STATUSES = {"accepted", "rejected", "returned"}


def _loan_code(loan: DocumentLoan) -> str:
    return f"PR-{loan.idLoan:08d}"


def _loan_evidence(loan: DocumentLoan) -> dict:
    return dict(loan.evidence or {})


def _related_units_for_loan(db: Session, entity_type: str, entity_id: int) -> set[tuple[str, int]]:
    units: set[tuple[str, int]] = {(entity_type, entity_id)}
    if entity_type == "document":
        document = db.get(Document, entity_id)
        if document:
            if document.ps952IdFolder:
                units.add(("folder", document.ps952IdFolder))
                folder = db.get(Folder, document.ps952IdFolder)
                if folder and folder.ps936IdBox:
                    units.add(("box", folder.ps936IdBox))
            if document.ps950IdExpedient:
                units.add(("expedient", document.ps950IdExpedient))
    elif entity_type == "folder":
        folder = db.get(Folder, entity_id)
        if folder:
            if folder.ps950IdExpedient:
                units.add(("expedient", folder.ps950IdExpedient))
            if folder.ps936IdBox:
                units.add(("box", folder.ps936IdBox))
            units.update(("document", row.idDocument) for row in db.query(Document).filter(Document.ps952IdFolder == entity_id).all())
    elif entity_type == "expedient":
        folders = db.query(Folder).filter(Folder.ps950IdExpedient == entity_id).all()
        units.update(("folder", row.idFolder) for row in folders)
        units.update(("document", row.idDocument) for row in db.query(Document).filter(Document.ps950IdExpedient == entity_id).all())
        units.update(("box", row.ps936IdBox) for row in folders if row.ps936IdBox)
    elif entity_type == "box":
        folders = db.query(Folder).filter(Folder.ps936IdBox == entity_id).all()
        units.update(("folder", row.idFolder) for row in folders)
        units.update(("expedient", row.ps950IdExpedient) for row in folders if row.ps950IdExpedient)
        for folder in folders:
            units.update(("document", row.idDocument) for row in db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).all())
    return units


def _loan_unit_conditions(units: set[tuple[str, int]]) -> list:
    return [(DocumentLoan.entity_type == entity_type) & (DocumentLoan.entity_id == entity_id) for entity_type, entity_id in units]


def _active_loans_for_entity(db: Session, entity_type: str, entity_id: int) -> list[DocumentLoan]:
    conditions = _loan_unit_conditions(_related_units_for_loan(db, entity_type, entity_id))
    if not conditions:
        return []
    return db.query(DocumentLoan).filter(or_(*conditions), DocumentLoan.status.in_(ACTIVE_LOAN_STATUSES)).all()


def _pending_transfer_for_entity(db: Session, entity_type: str, entity_id: int) -> TransferBatchItem | None:
    units = _related_units_for_loan(db, entity_type, entity_id)
    conditions = [(TransferBatchItem.entity_type == unit_type) & (TransferBatchItem.entity_id == unit_id) for unit_type, unit_id in units]
    if not conditions:
        return None
    return db.query(TransferBatchItem).filter(or_(*conditions), ~TransferBatchItem.status.in_(TERMINAL_TRANSFER_ITEM_STATUSES)).first()


def _set_entity_loan_status(db: Session, entity_type: str, entity_id: int, status_value: str) -> None:
    if entity_type == "document":
        entity = db.get(Document, entity_id)
        if entity:
            entity.status = status_value
    elif entity_type == "folder":
        entity = db.get(Folder, entity_id)
        if entity:
            entity.status = status_value
    elif entity_type == "expedient":
        entity = db.get(Expedient, entity_id)
        if entity:
            entity.status = status_value
    elif entity_type == "box":
        entity = db.get(PhysicalBox, entity_id)
        if entity:
            entity.status = "reserved" if status_value == "borrowed" else "active"


def _loan_kardex(db: Session, request: Request, user: User, loan: DocumentLoan, event: str, old_status: str | None, observation: str | None = None) -> KardexMovement:
    evidence = _loan_evidence(loan)
    movement = KardexMovement(
        movement_type=event,
        entity_type=loan.entity_type,
        entity_id=loan.entity_id,
        related_loan_id=loan.idLoan,
        ps930OriginArchiveId=loan.ps930IdArchive,
        ps930DestinationArchiveId=loan.ps930IdArchive,
        ps405ActorIdentification=user.identification,
        custodian_from=loan.approved_by,
        custodian_to=loan.requested_by,
        previous_status=old_status,
        status=loan.status,
        observations=observation or loan.observations,
        evidence_url=evidence.get("delivery_evidence_url") or evidence.get("return_evidence_url"),
        metadata_json={
            "loan_id": loan.idLoan,
            "loan_code": _loan_code(loan),
            "requester": {
                "name": loan.requested_by,
                "identification": evidence.get("requester_identification"),
                "area": evidence.get("requester_area"),
                "contact": evidence.get("requester_contact"),
            },
            "due_at": loan.due_at.isoformat() if loan.due_at else None,
            "returned_at": loan.returned_at.isoformat() if loan.returned_at else None,
            "location_path": _physical_location_path(db, loan.entity_type, loan.entity_id),
        },
    )
    if loan.entity_type == "document":
        movement.related_document_id = loan.entity_id
    elif loan.entity_type == "folder":
        movement.related_folder_id = loan.entity_id
    elif loan.entity_type == "expedient":
        movement.related_expedient_id = loan.entity_id
    elif loan.entity_type == "box":
        movement.related_box_id = loan.entity_id
    db.add(movement)
    db.flush()
    _trace(db, movement.idMovement, event, user, request, observation)
    return movement


def _refresh_loan_due_statuses(db: Session, request: Request, user: User, archive_ids: list[int]) -> int:
    today = datetime.now(UTC).date()
    updated = 0
    loans = db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive.in_(archive_ids), DocumentLoan.status.in_(["active", "due_today"]), DocumentLoan.due_at.is_not(None)).all()
    for loan in loans:
        due = loan.due_at
        if due and due.tzinfo is None:
            due = due.replace(tzinfo=UTC)
        next_status = "overdue" if due and due.date() < today else "due_today" if due and due.date() == today else "active"
        if next_status == loan.status:
            continue
        old_status = loan.status
        loan.status = next_status
        _loan_kardex(db, request, user, loan, f"loan.{next_status}", old_status, f"Prestamo {_loan_code(loan)} actualizado a {next_status}.")
        title = f"Prestamo {_loan_code(loan)} {'vencido' if next_status == 'overdue' else 'vence hoy'}"
        notify_action(
            db,
            user_id=loan.approved_by,
            archive_id=loan.ps930IdArchive,
            module="custody",
            title=title,
            message=f"{loan.entity_type} #{loan.entity_id} debe recuperarse o justificarse.",
            priority="critical" if next_status == "overdue" else "high",
            notification_type="loan_overdue" if next_status == "overdue" else "loan_due_today",
            related_entity_type="loan",
            related_entity_id=loan.idLoan,
            action_label="Resolver prestamo",
            action_url=f"/loans?loan={loan.idLoan}",
            metadata={"loan_code": _loan_code(loan), "entity_type": loan.entity_type, "entity_id": loan.entity_id},
        )
        create_operational_task(
            db,
            assigned_to=loan.approved_by,
            archive_id=loan.ps930IdArchive,
            module="custody",
            title=title,
            priority="critical" if next_status == "overdue" else "high",
            due_date=loan.due_at,
            related_entity_type="loan",
            related_entity_id=loan.idLoan,
            action_url=f"/loans?loan={loan.idLoan}",
            metadata={"message": f"Gestionar devolucion del prestamo {_loan_code(loan)}.", "entity_type": loan.entity_type, "entity_id": loan.entity_id},
        )
        write_audit(db, action=f"loan_{next_status}", module="archives", user_id=user.identification, entity="loan", entity_id=loan.idLoan, old_values={"status": old_status}, new_values={"status": next_status}, request=request)
        updated += 1
    return updated


def _loan_to_dict(db: Session, loan: DocumentLoan) -> dict:
    archive = db.get(Archive, loan.ps930IdArchive)
    evidence = _loan_evidence(loan)
    now = datetime.now(UTC)
    status_value = loan.status
    due_at = loan.due_at.replace(tzinfo=UTC) if loan.due_at and loan.due_at.tzinfo is None else loan.due_at
    if status_value in {"active", "due_today"} and due_at and due_at.date() < now.date():
        status_value = "overdue"
    return {
        "idLoan": loan.idLoan,
        "loan_code": _loan_code(loan),
        "entity_type": loan.entity_type,
        "entity_id": loan.entity_id,
        "ps930IdArchive": loan.ps930IdArchive,
        "archive_name": archive.archive_name if archive else None,
        "current_location_path": _physical_location_path(db, loan.entity_type, loan.entity_id),
        "requested_by": loan.requested_by,
        "requester_identification": evidence.get("requester_identification"),
        "requester_area": evidence.get("requester_area"),
        "requester_contact": evidence.get("requester_contact"),
        "approved_by": loan.approved_by,
        "authorized_by": evidence.get("authorized_by"),
        "due_at": loan.due_at,
        "expected_return_date": loan.due_at,
        "returned_at": loan.returned_at,
        "actual_return_date": loan.returned_at,
        "status": status_value,
        "reason": evidence.get("reason"),
        "observations": loan.observations,
        "return_observations": evidence.get("return_observations"),
        "delivery_evidence_url": evidence.get("delivery_evidence_url"),
        "return_evidence_url": evidence.get("return_evidence_url"),
        "evidence": evidence,
        "created_at": loan.created_at,
        "updated_at": loan.updated_at,
    }


def _document_support(document: Document) -> str:
    if document.files and document.physical_location:
        return "hybrid"
    if document.files:
        return "digital"
    return "physical"


def _document_dates(documents: list[Document]) -> tuple[str | None, str | None]:
    dates = sorted(document.created_at.date().isoformat() for document in documents if document.created_at)
    if not dates:
        return None, None
    return dates[0], dates[-1]


def _fuid_record_for_document(db: Session, document: Document, order: int, status_value: str = "generated", received_folios: int | None = None, received_quantity: int | None = None, inconsistency: str | None = None, observation: str | None = None) -> dict:
    folder = db.get(Folder, document.ps952IdFolder) if document.ps952IdFolder else None
    box = db.get(PhysicalBox, folder.ps936IdBox) if folder and folder.ps936IdBox else None
    shelf = db.get(Shelf, box.ps934IdShelf) if box and box.ps934IdShelf else None
    return {
        "order_number": order,
        "documentary_unit_type": "document",
        "documentary_unit_id": document.idDocument,
        "unit_code": f"DOC-{document.idDocument:06d}",
        "unit_title": document.document_name,
        "initial_date": document.created_at.date().isoformat() if document.created_at else None,
        "final_date": document.created_at.date().isoformat() if document.created_at else None,
        "support_type": _document_support(document),
        "conservation_unit": "folder" if folder else "other",
        "box_code": box.box_code if box else None,
        "folder_code": folder.folder_code if folder else None,
        "shelf_code": shelf.shelf_code if shelf else None,
        "physical_location_path": _physical_location_path(db, "document", document.idDocument),
        "folio_start": document.folio_start,
        "folio_end": document.folio_end,
        "total_folios_declared": document.folio_total or 0,
        "total_folios_received": received_folios,
        "quantity_declared": 1,
        "quantity_received": received_quantity,
        "status": status_value,
        "observations": observation,
        "inconsistencies": [inconsistency] if inconsistency else [],
    }


def _fuid_record_for_entity(db: Session, entity_type: str, entity_id: int, order: int, status_value: str = "generated", received_folios: int | None = None, received_quantity: int | None = None, inconsistency: str | None = None, observation: str | None = None) -> dict:
    if entity_type == "document":
        document = db.get(Document, entity_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        return _fuid_record_for_document(db, document, order, status_value, received_folios, received_quantity, inconsistency, observation)
    if entity_type == "folder":
        folder = db.get(Folder, entity_id)
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        documents = db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).order_by(Document.folio_start.asc()).all()
        initial, final = _document_dates(documents)
        box = db.get(PhysicalBox, folder.ps936IdBox) if folder.ps936IdBox else None
        shelf = db.get(Shelf, box.ps934IdShelf) if box and box.ps934IdShelf else None
        return {
            "order_number": order,
            "documentary_unit_type": "folder",
            "documentary_unit_id": folder.idFolder,
            "unit_code": folder.folder_code,
            "unit_title": folder.folder_name,
            "initial_date": initial,
            "final_date": final,
            "support_type": "hybrid" if any(document.files for document in documents) else "physical",
            "conservation_unit": "folder",
            "box_code": box.box_code if box else None,
            "folder_code": folder.folder_code,
            "shelf_code": shelf.shelf_code if shelf else None,
            "physical_location_path": _physical_location_path(db, "folder", folder.idFolder),
            "folio_start": min([document.folio_start for document in documents if document.folio_start], default=None),
            "folio_end": max([document.folio_end for document in documents if document.folio_end], default=None),
            "total_folios_declared": sum(document.folio_total or 0 for document in documents) or folder.folio_count or 0,
            "total_folios_received": received_folios,
            "quantity_declared": len(documents) or 1,
            "quantity_received": received_quantity,
            "status": status_value,
            "observations": observation,
            "inconsistencies": [inconsistency] if inconsistency else [],
        }
    if entity_type == "expedient":
        expedient = db.get(Expedient, entity_id)
        if not expedient:
            raise HTTPException(status_code=404, detail="Expedient not found")
        documents = _expedient_documents(db, expedient.idExpedient)
        initial, final = _document_dates(documents)
        return {
            "order_number": order,
            "documentary_unit_type": "expedient",
            "documentary_unit_id": expedient.idExpedient,
            "unit_code": expedient.expedient_code,
            "unit_title": expedient.expedient_name,
            "initial_date": initial,
            "final_date": final,
            "support_type": "hybrid" if any(document.files for document in documents) else "physical",
            "conservation_unit": "folder",
            "box_code": None,
            "folder_code": None,
            "shelf_code": None,
            "physical_location_path": _physical_location_path(db, "expedient", expedient.idExpedient),
            "folio_start": min([document.folio_start for document in documents if document.folio_start], default=None),
            "folio_end": max([document.folio_end for document in documents if document.folio_end], default=None),
            "total_folios_declared": sum(document.folio_total or 0 for document in documents) or expedient.folio_count or 0,
            "total_folios_received": received_folios,
            "quantity_declared": len(documents) or 1,
            "quantity_received": received_quantity,
            "status": status_value,
            "observations": observation,
            "inconsistencies": [inconsistency] if inconsistency else [],
        }
    if entity_type == "box":
        box = db.get(PhysicalBox, entity_id)
        if not box:
            raise HTTPException(status_code=404, detail="Box not found")
        folders = db.query(Folder).filter(Folder.ps936IdBox == box.idBox).all()
        documents = db.query(Document).join(Folder, Document.ps952IdFolder == Folder.idFolder).filter(Folder.ps936IdBox == box.idBox).all()
        initial, final = _document_dates(documents)
        shelf = db.get(Shelf, box.ps934IdShelf) if box.ps934IdShelf else None
        return {
            "order_number": order,
            "documentary_unit_type": "box",
            "documentary_unit_id": box.idBox,
            "unit_code": box.box_code,
            "unit_title": box.box_name or box.box_code,
            "initial_date": initial,
            "final_date": final,
            "support_type": "physical",
            "conservation_unit": "box",
            "box_code": box.box_code,
            "folder_code": None,
            "shelf_code": shelf.shelf_code if shelf else None,
            "physical_location_path": _physical_location_path(db, "box", box.idBox),
            "folio_start": min([document.folio_start for document in documents if document.folio_start], default=None),
            "folio_end": max([document.folio_end for document in documents if document.folio_end], default=None),
            "total_folios_declared": sum(document.folio_total or 0 for document in documents),
            "total_folios_received": received_folios,
            "quantity_declared": len(folders) or 1,
            "quantity_received": received_quantity,
            "status": status_value,
            "observations": observation,
            "inconsistencies": [inconsistency] if inconsistency else [],
        }
    raise HTTPException(status_code=422, detail="Unsupported FUID entity type")


def _fuid_records_from_expedient(db: Session, expedient: Expedient) -> list[dict]:
    records: list[dict] = []
    order = 1
    records.append(_fuid_record_for_entity(db, "expedient", expedient.idExpedient, order))
    order += 1
    for folder in _expedient_folders(db, expedient.idExpedient):
        records.append(_fuid_record_for_entity(db, "folder", folder.idFolder, order))
        order += 1
        for document in db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).order_by(Document.folio_start.asc()).all():
            records.append(_fuid_record_for_document(db, document, order))
            order += 1
    return records


def _fuid_records_from_transfer(db: Session, batch: TransferBatch) -> list[dict]:
    records = []
    for order, item in enumerate(db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch.idBatch).order_by(TransferBatchItem.idBatchItem.asc()).all(), start=1):
        inconsistency = item.rejection_reason
        if item.status == "partially_received" and not inconsistency:
            inconsistency = "quantity_or_folio_mismatch"
        records.append(_fuid_record_for_entity(db, item.entity_type, item.entity_id, order, status_value=item.status if item.status != "pending" else "under_review", received_folios=item.received_folios, received_quantity=item.received_quantity, inconsistency=inconsistency, observation=item.observation))
    return records


def _fuid_state_from_records(records: list[dict]) -> str:
    statuses = {record.get("status") for record in records}
    if not records:
        return "draft"
    if statuses <= {"accepted"}:
        return "accepted"
    if statuses <= {"rejected"}:
        return "rejected"
    if "partially_received" in statuses or ("accepted" in statuses and "rejected" in statuses):
        return "partially_received"
    if "under_review" in statuses:
        return "under_review"
    return "generated"


def _fuid_to_dict(item: InventoryFuid) -> dict:
    metadata = item.metadata_json or {}
    return {
        "idFuid": item.idFuid,
        "fuid_code": item.fuid_code,
        "ps930IdArchive": item.ps930IdArchive,
        "archive_origin_id": metadata.get("archive_origin_id", item.ps930IdArchive),
        "archive_destination_id": metadata.get("archive_destination_id"),
        "ps950IdExpedient": item.ps950IdExpedient,
        "ps1070IdBatch": item.ps1070IdBatch,
        "support_type": item.support_type,
        "folio_total": item.folio_total,
        "location_summary": item.location_summary,
        "observations": item.observations,
        "status": metadata.get("status", "generated"),
        "version": metadata.get("version", 1),
        "items_count": len(metadata.get("items", [])),
        "inconsistencies_count": sum(1 for record in metadata.get("items", []) if record.get("inconsistencies")),
        "delivery_evidence_count": len((metadata.get("evidences") or {}).get("delivery", [])),
        "reception_evidence_count": len((metadata.get("evidences") or {}).get("reception", [])),
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "metadata": metadata,
    }


def _transfer_item_to_dict(item: TransferBatchItem | None) -> dict | None:
    if not item:
        return None
    return {
        "idBatchItem": item.idBatchItem,
        "batch_id": item.ps1070IdBatch,
        "entity_type": item.entity_type,
        "entity_id": item.entity_id,
        "expected_quantity": item.expected_quantity,
        "received_quantity": item.received_quantity,
        "expected_folios": item.expected_folios,
        "received_folios": item.received_folios,
        "status": "pending_review" if item.status == "pending" else item.status,
        "rejection_reason": item.rejection_reason,
        "observation": item.observation,
    }


def _require_fuid_access(db: Session, user: User, fuid_id: int, levels: set[str] | None = None) -> InventoryFuid:
    item = db.get(InventoryFuid, fuid_id)
    if not item:
        raise HTTPException(status_code=404, detail="FUID not found")
    metadata = item.metadata_json or {}
    archive_ids = {item.ps930IdArchive}
    if metadata.get("archive_destination_id"):
        archive_ids.add(metadata["archive_destination_id"])
    allowed = False
    for archive_id in archive_ids:
        try:
            _require_archive_access(db, user, archive_id, levels)
            allowed = True
            break
        except HTTPException as exc:
            if exc.status_code != 403:
                raise
    if not allowed:
        raise HTTPException(status_code=403, detail="Archive access denied")
    return item


def _fuid_movement(db: Session, request: Request, user: User, item: InventoryFuid, event: str, old_status: str | None = None, observation: str | None = None, evidence_url: str | None = None) -> KardexMovement:
    metadata = item.metadata_json or {}
    movement = KardexMovement(
        movement_type=event,
        entity_type="fuid",
        entity_id=item.idFuid,
        related_expedient_id=item.ps950IdExpedient,
        related_transfer_id=item.ps1070IdBatch,
        ps930OriginArchiveId=metadata.get("archive_origin_id", item.ps930IdArchive),
        ps930DestinationArchiveId=metadata.get("archive_destination_id"),
        ps405ActorIdentification=user.identification,
        previous_status=old_status,
        status=metadata.get("status", "generated"),
        evidence_url=evidence_url,
        observations=observation,
        metadata_json={"fuid_code": item.fuid_code, "version": metadata.get("version", 1)},
    )
    db.add(movement)
    db.flush()
    _trace(db, movement.idMovement, event, user, request, observation)
    return movement


def _fuid_csv_lines(item: InventoryFuid) -> list[str]:
    metadata = item.metadata_json or {}
    lines = ["order_number,unit_type,unit_code,unit_title,initial_date,final_date,support,conservation_unit,box_code,folder_code,shelf_code,location,folio_start,folio_end,folios_declared,folios_received,quantity_declared,quantity_received,status,inconsistencies,observations"]
    for record in metadata.get("items", []):
        values = [
            record.get("order_number"),
            record.get("documentary_unit_type"),
            record.get("unit_code"),
            record.get("unit_title"),
            record.get("initial_date"),
            record.get("final_date"),
            record.get("support_type"),
            record.get("conservation_unit"),
            record.get("box_code"),
            record.get("folder_code"),
            record.get("shelf_code"),
            record.get("physical_location_path"),
            record.get("folio_start"),
            record.get("folio_end"),
            record.get("total_folios_declared"),
            record.get("total_folios_received"),
            record.get("quantity_declared"),
            record.get("quantity_received"),
            record.get("status"),
            "|".join(record.get("inconsistencies") or []),
            record.get("observations"),
        ]
        lines.append(",".join(str(value or "").replace(",", " ") for value in values))
    return lines


def _xlsx_from_lines(lines: list[str]) -> bytes:
    rows = [line.split(",") for line in lines]
    shared_strings: list[str] = []
    index: dict[str, int] = {}

    def shared(value: str) -> int:
        if value not in index:
            index[value] = len(shared_strings)
            shared_strings.append(value)
        return index[value]

    sheet_rows = []
    for row_number, row in enumerate(rows, start=1):
        cells = []
        for col_number, value in enumerate(row, start=1):
            col = ""
            number = col_number
            while number:
                number, remainder = divmod(number - 1, 26)
                col = chr(65 + remainder) + col
            cells.append(f'<c r="{col}{row_number}" t="s"><v>{shared(value)}</v></c>')
        sheet_rows.append(f'<row r="{row_number}">{"".join(cells)}</row>')
    shared_xml = "".join(f"<si><t>{escape(value)}</t></si>" for value in shared_strings)
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
        archive.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="FUID" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
        archive.writestr("xl/worksheets/sheet1.xml", f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(sheet_rows)}</sheetData></worksheet>')
        archive.writestr("xl/sharedStrings.xml", f'<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{len(shared_strings)}" uniqueCount="{len(shared_strings)}">{shared_xml}</sst>')
    return buffer.getvalue()


@router.get("/expedients/{expedient_id}/detail")
def expedient_detail(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    return _expedient_detail_payload(db, expedient)


@router.get("/expedients/{expedient_id}/tree")
def expedient_tree(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    folders = _expedient_folders(db, expedient_id)
    documents = _expedient_documents(db, expedient_id)
    documents_by_folder: dict[int, list[Document]] = {}
    for document in documents:
        if document.ps952IdFolder:
            documents_by_folder.setdefault(document.ps952IdFolder, []).append(document)
    return {
        "id": expedient.idExpedient,
        "type": "expedient",
        "code": expedient.expedient_code,
        "name": expedient.expedient_name,
        "status": expedient.status,
        "children": [
            {
                "id": folder.idFolder,
                "type": "folder",
                "code": folder.folder_code,
                "name": folder.folder_name,
                "status": folder.status,
                "documents_count": len(documents_by_folder.get(folder.idFolder, [])),
                "folios_count": sum(item.folio_total or 0 for item in documents_by_folder.get(folder.idFolder, [])),
                "box_id": folder.ps936IdBox,
                "physical_location": folder.physical_location,
                "children": [
                    {
                        "id": document.idDocument,
                        "type": "document",
                        "name": document.document_name,
                        "document_type": document.document_type,
                        "folio_start": document.folio_start,
                        "folio_end": document.folio_end,
                        "folio_total": document.folio_total,
                        "support": (document.metadata_json or {}).get("support_type", "hibrido" if document.files else "fisico"),
                        "status": document.status,
                        "version": document.version,
                        "has_digital_file": bool(document.files),
                    }
                    for document in documents_by_folder.get(folder.idFolder, [])
                ],
            }
            for folder in folders
        ],
    }


@router.get("/expedients/{expedient_id}/compliance")
def expedient_compliance(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    return _expedient_compliance(db, expedient)


@router.get("/expedients/{expedient_id}/closure-check")
def expedient_closure_check(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    compliance = _expedient_compliance(db, expedient)
    return {"closable": compliance["ready_to_close"], "status": compliance["status"], "blocking_errors": compliance["critical_errors"], "warnings": compliance["warnings"], "checklist": compliance["checklist"]}


@router.post("/expedients/{expedient_id}/close")
def close_expedient(expedient_id: int, payload: ExpedientClosePayload, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id, {"operate", "admin"})
    if expedient.status == "closed":
        raise HTTPException(status_code=409, detail="Expedient is already closed")
    compliance = _expedient_compliance(db, expedient)
    if not compliance["ready_to_close"]:
        raise HTTPException(status_code=409, detail={"message": "Expedient is not ready to close", "blocking_errors": compliance["critical_errors"]})
    old_status = expedient.status
    now = datetime.now(UTC)
    metadata = dict(expedient.metadata_json or {})
    metadata["closure"] = {"closed_at": now.isoformat(), "closed_by": user.identification, "observation": payload.observation, "checklist": compliance["checklist"]}
    expedient.metadata_json = metadata
    expedient.status = "closed"
    movement = KardexMovement(
        movement_type="expedient.closed",
        entity_type="expedient",
        entity_id=expedient.idExpedient,
        related_expedient_id=expedient.idExpedient,
        ps930OriginArchiveId=expedient.ps930IdArchive,
        ps930DestinationArchiveId=expedient.ps930IdArchive,
        ps405ActorIdentification=user.identification,
        previous_status=old_status,
        status="closed",
        observations=payload.observation or "Expediente cerrado con checklist de cumplimiento",
        metadata_json={"checklist": compliance["checklist"], "ready_to_close": True},
    )
    db.add(movement)
    db.flush()
    _trace(db, movement.idMovement, "expedient_closed", user, request, payload.observation)
    write_audit(db, action="expedient_closed", module="archives", user_id=user.identification, entity="expedient", entity_id=expedient.idExpedient, old_values={"status": old_status}, new_values={"status": "closed", "closure": metadata["closure"]}, request=request)
    db.commit()
    db.refresh(expedient)
    return _expedient_detail_payload(db, expedient)


@router.get("/expedients/{expedient_id}/foliation")
def expedient_foliation(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    documents = _expedient_documents(db, expedient.idExpedient)
    return _foliation_report(documents)


@router.get("/expedients/{expedient_id}/missing-documents")
def expedient_missing_documents(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    documents = _expedient_documents(db, expedient.idExpedient)
    return {"expedient_id": expedient.idExpedient, "missing_documents": _missing_documents(expedient, documents)}


@router.get("/expedients/{expedient_id}/locations")
def expedient_locations(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    folders = _expedient_folders(db, expedient_id)
    folder_locations = []
    for folder in folders:
        box = db.get(PhysicalBox, folder.ps936IdBox) if folder.ps936IdBox else None
        shelf = db.get(Shelf, box.ps934IdShelf) if box and box.ps934IdShelf else None
        folder_locations.append({
            "folder_id": folder.idFolder,
            "folder_code": folder.folder_code,
            "folder_name": folder.folder_name,
            "physical_location": folder.physical_location,
            "box_id": box.idBox if box else None,
            "box_code": box.box_code if box else None,
            "shelf_id": shelf.idShelf if shelf else None,
            "shelf_code": shelf.shelf_code if shelf else None,
            "shelf_location": shelf.physical_location if shelf else None,
        })
    return {"expedient_id": expedient.idExpedient, "physical_location": expedient.physical_location, "digital_location": expedient.digital_location, "folders": folder_locations}


@router.get("/expedients/{expedient_id}/related-transfers")
def expedient_related_transfers(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    folders = _expedient_folders(db, expedient_id)
    documents = _expedient_documents(db, expedient_id)
    rows = _expedient_related_transfers(db, expedient.idExpedient, folders, documents)
    return [
        {
            "idBatchItem": item.idBatchItem,
            "batch_id": item.ps1070IdBatch,
            "batch_code": db.get(TransferBatch, item.ps1070IdBatch).batch_code if db.get(TransferBatch, item.ps1070IdBatch) else None,
            "entity_type": item.entity_type,
            "entity_id": item.entity_id,
            "status": item.status,
            "origin_archive_id": item.ps930OriginArchiveId,
            "destination_archive_id": item.ps930DestinationArchiveId,
            "rejection_reason": item.rejection_reason,
            "observation": item.observation,
            "reviewed_at": item.reviewed_at,
        }
        for item in rows
    ]


@router.get("/expedients/{expedient_id}/related-loans")
def expedient_related_loans(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    folders = _expedient_folders(db, expedient_id)
    documents = _expedient_documents(db, expedient_id)
    return _expedient_related_loans(db, expedient.idExpedient, folders, documents)


@router.get("/expedients/{expedient_id}/audit")
def expedient_audit(expedient_id: int, user: User = Depends(require_permission("audit.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    folder_ids = [item.idFolder for item in _expedient_folders(db, expedient_id)]
    document_ids = [item.idDocument for item in _expedient_documents(db, expedient_id)]
    conditions = [(AuditLog.entity == "expedient") & (AuditLog.entity_id == str(expedient.idExpedient))]
    if folder_ids:
        conditions.append((AuditLog.entity == "folder") & AuditLog.entity_id.in_([str(item) for item in folder_ids]))
    if document_ids:
        conditions.append((AuditLog.entity == "document") & AuditLog.entity_id.in_([str(item) for item in document_ids]))
    return db.query(AuditLog).filter(or_(*conditions)).order_by(AuditLog.created_at.desc()).limit(100).all()


@router.get("/folders")
def list_folders(expedient_id: int | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    query = db.query(Folder).filter(Folder.ps930IdArchive.in_(ids))
    if expedient_id:
        query = query.filter(Folder.ps950IdExpedient == expedient_id)
    return query.order_by(Folder.created_at.desc()).all()


@router.post("/folders", status_code=status.HTTP_201_CREATED)
def create_folder(payload: FolderCreate, request: Request, user: User = Depends(require_permission("document.create")), db: Session = Depends(get_db)):
    expedient = db.get(Expedient, payload.expedient_id)
    if not expedient:
        raise HTTPException(status_code=404, detail="Expedient not found")
    _require_archive_access(db, user, expedient.ps930IdArchive, {"operate", "admin"})
    if payload.box_id and not db.get(PhysicalBox, payload.box_id):
        raise HTTPException(status_code=422, detail="Box not found")
    item = Folder(
        folder_code=payload.folder_code,
        folder_name=payload.folder_name,
        ps950IdExpedient=expedient.idExpedient,
        ps930IdArchive=expedient.ps930IdArchive,
        ps936IdBox=payload.box_id,
        physical_location=payload.physical_location,
        metadata_json=payload.metadata,
    )
    db.add(item)
    db.flush()
    expedient.document_count = db.query(Document).filter(Document.ps950IdExpedient == expedient.idExpedient).count()
    if payload.box_id:
        box = db.get(PhysicalBox, payload.box_id)
        if box:
            box.current_folders += 1
    movement = KardexMovement(
        movement_type="document_created",
        entity_type="folder",
        entity_id=item.idFolder,
        ps930DestinationArchiveId=expedient.ps930IdArchive,
        ps405ActorIdentification=user.identification,
        status="accepted",
        observations="Carpeta creada dentro de expediente vivo",
    )
    db.add(movement)
    db.flush()
    _trace(db, movement.idMovement, "folder_created", user, request, item.folder_code)
    write_audit(db, action="folder_created", module="archives", user_id=user.identification, entity="folder", entity_id=item.idFolder, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.post("/shelves", status_code=status.HTTP_201_CREATED)
def create_shelf(payload: ShelfCreate, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    _require_archive_access(db, user, payload.archive_id, {"admin"})
    item = Shelf(ps930IdArchive=payload.archive_id, shelf_code=payload.shelf_code, shelf_name=payload.shelf_name, capacity_boxes=payload.capacity_boxes, physical_location=payload.physical_location)
    db.add(item)
    db.flush()
    _location_movement(db, request, user, movement_type="shelf.created", entity_type="box", entity_id=0, archive_id=payload.archive_id, previous=None, current=payload.shelf_code, observation=f"Estanteria creada: {payload.shelf_code}")
    write_audit(db, action="shelf_created", module="archives", user_id=user.identification, entity="shelf", new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return _shelf_out(db, item)


@router.get("/shelves")
def list_shelves(archive_id: int | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    query = db.query(Shelf).filter(Shelf.ps930IdArchive.in_(ids))
    if archive_id:
        _require_archive_access(db, user, archive_id)
        query = query.filter(Shelf.ps930IdArchive == archive_id)
    return [_shelf_out(db, item) for item in query.order_by(Shelf.shelf_code.asc()).all()]


@router.get("/shelves/{shelf_id}")
def get_shelf(shelf_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    item = db.get(Shelf, shelf_id)
    if not item:
        raise HTTPException(status_code=404, detail="Shelf not found")
    _require_archive_access(db, user, item.ps930IdArchive)
    return _shelf_out(db, item)


@router.patch("/shelves/{shelf_id}")
def update_shelf(shelf_id: int, payload: ShelfUpdate, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    item = db.get(Shelf, shelf_id)
    if not item:
        raise HTTPException(status_code=404, detail="Shelf not found")
    _require_archive_access(db, user, item.ps930IdArchive, {"admin"})
    old_values = _shelf_out(db, item)
    if payload.shelf_name is not None:
        item.shelf_name = payload.shelf_name
    if payload.capacity_boxes is not None:
        item.capacity_boxes = payload.capacity_boxes
    if payload.status is not None:
        item.status = payload.status
    if payload.physical_location is not None:
        item.physical_location = payload.physical_location
    db.flush()
    _location_movement(db, request, user, movement_type="shelf.updated", entity_type="box", entity_id=0, archive_id=item.ps930IdArchive, previous=old_values.get("physical_location"), current=item.physical_location or item.shelf_code, observation=f"Estanteria actualizada: {item.shelf_code}")
    write_audit(db, action="shelf_updated", module="archives", user_id=user.identification, entity="shelf", entity_id=item.idShelf, old_values=old_values, new_values=payload.model_dump(exclude_unset=True), request=request)
    db.commit()
    db.refresh(item)
    return _shelf_out(db, item)


@router.post("/boxes", status_code=status.HTTP_201_CREATED)
def create_box(payload: BoxCreate, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    archive = _require_archive_access(db, user, payload.archive_id, {"admin"})
    if payload.shelf_id:
        shelf = db.get(Shelf, payload.shelf_id)
        if not shelf:
            raise HTTPException(status_code=404, detail="Shelf not found")
        if shelf.ps930IdArchive != payload.archive_id:
            raise HTTPException(status_code=422, detail="Shelf belongs to another archive. Use transfer before changing archive.")
    item = PhysicalBox(ps930IdArchive=payload.archive_id, ps934IdShelf=payload.shelf_id, box_code=payload.box_code, box_name=payload.box_name, capacity_folders=payload.capacity_folders)
    db.add(item)
    archive.box_count += 1
    db.flush()
    _location_movement(db, request, user, movement_type="box.created", entity_type="box", entity_id=item.idBox, archive_id=payload.archive_id, previous=None, current=_physical_location_path(db, "box", item.idBox), observation=f"Caja creada: {item.box_code}")
    write_audit(db, action="box_created", module="archives", user_id=user.identification, entity="box", new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return _box_out(db, item)


@router.get("/boxes")
def list_boxes(archive_id: int | None = None, shelf_id: int | None = None, status_filter: str | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    query = db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive.in_(ids))
    if archive_id:
        _require_archive_access(db, user, archive_id)
        query = query.filter(PhysicalBox.ps930IdArchive == archive_id)
    if shelf_id:
        shelf = db.get(Shelf, shelf_id)
        if not shelf:
            raise HTTPException(status_code=404, detail="Shelf not found")
        _require_archive_access(db, user, shelf.ps930IdArchive)
        query = query.filter(PhysicalBox.ps934IdShelf == shelf_id)
    boxes = [_box_out(db, item) for item in query.order_by(PhysicalBox.box_code.asc()).all()]
    if status_filter:
        boxes = [item for item in boxes if item["status"] == status_filter]
    return boxes


@router.get("/boxes/{box_id}")
def get_box(box_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    item = db.get(PhysicalBox, box_id)
    if not item:
        raise HTTPException(status_code=404, detail="Box not found")
    _require_archive_access(db, user, item.ps930IdArchive)
    return _box_out(db, item)


@router.patch("/boxes/{box_id}")
def update_box(box_id: int, payload: BoxUpdate, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    item = db.get(PhysicalBox, box_id)
    if not item:
        raise HTTPException(status_code=404, detail="Box not found")
    _require_archive_access(db, user, item.ps930IdArchive, {"admin"})
    old_values = _box_out(db, item)
    if payload.box_name is not None:
        item.box_name = payload.box_name
    if payload.capacity_folders is not None:
        item.capacity_folders = payload.capacity_folders
    if payload.status is not None:
        item.status = payload.status
    db.flush()
    _location_movement(db, request, user, movement_type="box.updated", entity_type="box", entity_id=item.idBox, archive_id=item.ps930IdArchive, previous=old_values["location_path"], current=_physical_location_path(db, "box", item.idBox), observation=f"Caja actualizada: {item.box_code}")
    write_audit(db, action="box_updated", module="archives", user_id=user.identification, entity="box", entity_id=item.idBox, old_values=old_values, new_values=payload.model_dump(exclude_unset=True), request=request)
    db.commit()
    db.refresh(item)
    return _box_out(db, item)


@router.post("/boxes/{box_id}/move")
def move_box(box_id: int, payload: BoxMove, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    item = db.get(PhysicalBox, box_id)
    shelf = db.get(Shelf, payload.shelf_id)
    if not item:
        raise HTTPException(status_code=404, detail="Box not found")
    if not shelf:
        raise HTTPException(status_code=404, detail="Shelf not found")
    _require_archive_access(db, user, item.ps930IdArchive, {"admin"})
    _require_archive_access(db, user, shelf.ps930IdArchive, {"admin"})
    if shelf.ps930IdArchive != item.ps930IdArchive:
        raise HTTPException(status_code=422, detail="Physical movement cannot change archive. Create a document transfer instead.")
    previous_path = _physical_location_path(db, "box", item.idBox)
    item.ps934IdShelf = shelf.idShelf
    db.flush()
    current_path = _physical_location_path(db, "box", item.idBox)
    _location_movement(db, request, user, movement_type="box.moved", entity_type="box", entity_id=item.idBox, archive_id=item.ps930IdArchive, previous=previous_path, current=current_path, observation=payload.observation)
    for folder in db.query(Folder).filter(Folder.ps936IdBox == item.idBox).all():
        folder.physical_location = _physical_location_path(db, "folder", folder.idFolder)
    write_audit(db, action="box_moved", module="archives", user_id=user.identification, entity="box", entity_id=item.idBox, old_values={"location_path": previous_path}, new_values={"location_path": current_path, "shelf_id": shelf.idShelf}, request=request)
    db.commit()
    db.refresh(item)
    return _box_out(db, item)


@router.get("/boxes/{box_id}/contents")
def box_contents(box_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    item = db.get(PhysicalBox, box_id)
    if not item:
        raise HTTPException(status_code=404, detail="Box not found")
    _require_archive_access(db, user, item.ps930IdArchive)
    folders = db.query(Folder).filter(Folder.ps936IdBox == box_id).order_by(Folder.folder_code.asc()).all()
    return {
        "box": _box_out(db, item),
        "folders": [
            {
                "idFolder": folder.idFolder,
                "folder_code": folder.folder_code,
                "folder_name": folder.folder_name,
                "expedient_id": folder.ps950IdExpedient,
                "documents_count": db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).count(),
                "folio_count": folder.folio_count,
                "status": folder.status,
                "location_path": _physical_location_path(db, "folder", folder.idFolder),
                "documents": [
                    {
                        "idDocument": document.idDocument,
                        "document_name": document.document_name,
                        "document_type": document.document_type,
                        "folio_start": document.folio_start,
                        "folio_end": document.folio_end,
                        "status": document.status,
                        "location_path": _physical_location_path(db, "document", document.idDocument),
                    }
                    for document in db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).order_by(Document.folio_start.asc()).all()
                ],
            }
            for folder in folders
        ],
    }


@router.post("/folders/{folder_id}/assign-location")
def assign_folder_location(folder_id: int, payload: FolderLocationPayload, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    return move_folder_location(folder_id, payload, request, user, db)


@router.post("/folders/{folder_id}/move-location")
def move_folder_location(folder_id: int, payload: FolderLocationPayload, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    folder = db.get(Folder, folder_id)
    box = db.get(PhysicalBox, payload.box_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    if not box:
        raise HTTPException(status_code=404, detail="Box not found")
    _require_archive_access(db, user, folder.ps930IdArchive, {"admin", "operate"})
    _require_archive_access(db, user, box.ps930IdArchive, {"admin", "operate"})
    if box.ps930IdArchive != folder.ps930IdArchive:
        raise HTTPException(status_code=422, detail="Physical movement cannot change archive. Create a document transfer instead.")
    previous_box = folder.ps936IdBox
    previous_path = _physical_location_path(db, "folder", folder.idFolder)
    folder.ps936IdBox = box.idBox
    folder.physical_location = _physical_location_path(db, "folder", folder.idFolder)
    if previous_box and previous_box != box.idBox:
        previous = db.get(PhysicalBox, previous_box)
        if previous and previous.current_folders > 0:
            previous.current_folders -= 1
    if previous_box != box.idBox:
        box.current_folders += 1
    db.flush()
    current_path = _physical_location_path(db, "folder", folder.idFolder)
    _location_movement(db, request, user, movement_type="folder.moved" if previous_box else "location.assigned", entity_type="folder", entity_id=folder.idFolder, archive_id=folder.ps930IdArchive, previous=previous_path, current=current_path, observation=payload.observation)
    write_audit(db, action="folder_location_changed", module="archives", user_id=user.identification, entity="folder", entity_id=folder.idFolder, old_values={"box_id": previous_box, "location_path": previous_path}, new_values={"box_id": box.idBox, "location_path": current_path}, request=request)
    db.commit()
    db.refresh(folder)
    return {"folder_id": folder.idFolder, "box_id": folder.ps936IdBox, "location_path": current_path}


@router.get("/entities/{entity_type}/{entity_id}/physical-location")
def entity_physical_location(entity_type: str, entity_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    archive_id = _movement_archive_for_entity(db, entity_type, entity_id)
    if archive_id:
        _require_archive_access(db, user, archive_id)
    return {"entity_type": entity_type, "entity_id": entity_id, "archive_id": archive_id, "location_path": _physical_location_path(db, entity_type, entity_id)}


@router.get("/entities/{entity_type}/{entity_id}/location-history")
def entity_location_history(entity_type: str, entity_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    archive_id = _movement_archive_for_entity(db, entity_type, entity_id)
    if archive_id:
        _require_archive_access(db, user, archive_id)
    rows = db.query(KardexMovement).filter(
        KardexMovement.entity_type == entity_type,
        KardexMovement.entity_id == entity_id,
        KardexMovement.movement_type.in_(["location.assigned", "location.changed", "location.removed", "box.moved", "folder.moved", "document.moved", "box.created", "box.closed", "box.reopened", "shelf.created", "shelf.updated", "box.updated"]),
    ).order_by(KardexMovement.created_at.desc()).all()
    return rows


@router.get("/locations/summary")
def locations_summary(archive_id: int | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    if archive_id:
        _require_archive_access(db, user, archive_id)
        ids = [archive_id]
    if not ids:
        return {"archives": 0, "shelves": 0, "boxes": 0, "full_boxes": 0, "available_boxes": 0, "folders_without_box": 0, "documents_without_location": 0, "recent_movements": 0, "by_archive": []}
    boxes = [_box_out(db, item) for item in db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive.in_(ids)).all()]
    by_archive = []
    for archive in db.query(Archive).filter(Archive.idArchive.in_(ids)).all():
        archive_boxes = [item for item in boxes if item["archive_id"] == archive.idArchive]
        by_archive.append({
            "archive_id": archive.idArchive,
            "archive_name": archive.archive_name,
            "capacity_boxes": archive.capacity_units,
            "boxes": len(archive_boxes),
            "occupancy_percent": round((len(archive_boxes) / archive.capacity_units) * 100, 2) if archive.capacity_units else 0,
            "folders_without_box": db.query(Folder).filter(Folder.ps930IdArchive == archive.idArchive, Folder.ps936IdBox.is_(None)).count(),
        })
    physical_events = ["location.assigned", "location.changed", "location.removed", "box.moved", "folder.moved", "document.moved", "box.created", "box.closed", "box.reopened", "shelf.created", "shelf.updated", "box.updated"]
    return {
        "archives": len(ids),
        "shelves": db.query(Shelf).filter(Shelf.ps930IdArchive.in_(ids)).count(),
        "boxes": len(boxes),
        "full_boxes": len([item for item in boxes if item["status"] == "full"]),
        "available_boxes": len([item for item in boxes if item["status"] != "full"]),
        "folders_without_box": db.query(Folder).filter(Folder.ps930IdArchive.in_(ids), Folder.ps936IdBox.is_(None)).count(),
        "documents_without_location": db.query(Document).join(Folder, Document.ps952IdFolder == Folder.idFolder, isouter=True).filter(Document.ps930IdArchive.in_(ids), or_(Document.ps952IdFolder.is_(None), Folder.ps936IdBox.is_(None))).count(),
        "recent_movements": db.query(KardexMovement).filter(or_(KardexMovement.ps930OriginArchiveId.in_(ids), KardexMovement.ps930DestinationArchiveId.in_(ids)), KardexMovement.movement_type.in_(physical_events)).count(),
        "by_archive": by_archive,
    }


@router.get("/locations/tree")
def locations_tree(archive_id: int | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    if archive_id:
        _require_archive_access(db, user, archive_id)
        ids = [archive_id]
    result = []
    for archive in db.query(Archive).filter(Archive.idArchive.in_(ids)).order_by(Archive.archive_name.asc()).all():
        shelves = []
        for shelf in db.query(Shelf).filter(Shelf.ps930IdArchive == archive.idArchive).order_by(Shelf.shelf_code.asc()).all():
            boxes = []
            for box in db.query(PhysicalBox).filter(PhysicalBox.ps934IdShelf == shelf.idShelf).order_by(PhysicalBox.box_code.asc()).all():
                folders = db.query(Folder).filter(Folder.ps936IdBox == box.idBox).order_by(Folder.folder_code.asc()).all()
                boxes.append({**_box_out(db, box), "folders": [{"idFolder": folder.idFolder, "folder_code": folder.folder_code, "folder_name": folder.folder_name, "documents_count": db.query(Document).filter(Document.ps952IdFolder == folder.idFolder).count(), "location_path": _physical_location_path(db, "folder", folder.idFolder)} for folder in folders]})
            shelves.append({**_shelf_out(db, shelf), "boxes": boxes})
        boxes_without_shelf = db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive == archive.idArchive, PhysicalBox.ps934IdShelf.is_(None)).order_by(PhysicalBox.box_code.asc()).all()
        result.append({"archive_id": archive.idArchive, "archive_name": archive.archive_name, "archive_code": archive.archive_code, "shelves": shelves, "boxes_without_shelf": [_box_out(db, box) for box in boxes_without_shelf]})
    return result


@router.get("/locations/unassigned")
def locations_unassigned(archive_id: int | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    if archive_id:
        _require_archive_access(db, user, archive_id)
        ids = [archive_id]
    boxes_without_shelf = db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive.in_(ids), PhysicalBox.ps934IdShelf.is_(None)).order_by(PhysicalBox.box_code.asc()).all()
    folders_without_box = db.query(Folder).filter(Folder.ps930IdArchive.in_(ids), Folder.ps936IdBox.is_(None)).order_by(Folder.folder_code.asc()).all()
    documents_without_location = db.query(Document).join(Folder, Document.ps952IdFolder == Folder.idFolder, isouter=True).filter(Document.ps930IdArchive.in_(ids), or_(Document.ps952IdFolder.is_(None), Folder.ps936IdBox.is_(None))).order_by(Document.document_name.asc()).all()
    expedients_without_location = db.query(Expedient).filter(Expedient.ps930IdArchive.in_(ids), Expedient.physical_location.is_(None)).order_by(Expedient.expedient_code.asc()).all()
    return {
        "boxes_without_shelf": [_box_out(db, item) for item in boxes_without_shelf],
        "folders_without_box": [{"idFolder": item.idFolder, "folder_code": item.folder_code, "folder_name": item.folder_name, "archive_id": item.ps930IdArchive, "expedient_id": item.ps950IdExpedient} for item in folders_without_box],
        "documents_without_location": [{"idDocument": item.idDocument, "document_name": item.document_name, "archive_id": item.ps930IdArchive, "folder_id": item.ps952IdFolder} for item in documents_without_location],
        "expedients_without_location": [{"idExpedient": item.idExpedient, "expedient_code": item.expedient_code, "expedient_name": item.expedient_name, "archive_id": item.ps930IdArchive} for item in expedients_without_location],
    }


@router.get("/locations/movements")
def locations_movements(archive_id: int | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    if archive_id:
        _require_archive_access(db, user, archive_id)
        ids = [archive_id]
    physical_events = ["location.assigned", "location.changed", "location.removed", "box.moved", "folder.moved", "document.moved", "box.created", "box.closed", "box.reopened", "shelf.created", "shelf.updated", "box.updated"]
    rows = db.query(KardexMovement).filter(or_(KardexMovement.ps930OriginArchiveId.in_(ids), KardexMovement.ps930DestinationArchiveId.in_(ids)), KardexMovement.movement_type.in_(physical_events)).order_by(KardexMovement.created_at.desc()).limit(100).all()
    return rows


@router.post("/foliation", status_code=status.HTTP_201_CREATED)
def create_foliation(payload: FoliationCreate, request: Request, user: User = Depends(require_permission("document.update")), db: Session = Depends(get_db)):
    if payload.folio_end < payload.folio_start:
        raise HTTPException(status_code=422, detail="Folio end must be greater than or equal to folio start")
    document = db.get(Document, payload.document_id)
    expedient = db.get(Expedient, payload.expedient_id)
    folder = db.get(Folder, payload.folder_id)
    if not document or not expedient or not folder:
        raise HTTPException(status_code=404, detail="Document, expedient or folder not found")
    _require_archive_access(db, user, expedient.ps930IdArchive, {"operate", "admin"})
    overlap = db.query(Foliation).filter(
        Foliation.ps950IdExpedient == expedient.idExpedient,
        Foliation.folio_start <= payload.folio_end,
        Foliation.folio_end >= payload.folio_start,
    ).first()
    if overlap:
        raise HTTPException(status_code=409, detail="Folio range overlaps an existing document")
    total = payload.folio_end - payload.folio_start + 1
    item = Foliation(ps520IdDocument=document.idDocument, ps950IdExpedient=expedient.idExpedient, ps952IdFolder=folder.idFolder, folio_start=payload.folio_start, folio_end=payload.folio_end, folio_total=total, electronic_folios=payload.electronic_folios, annexes=payload.annexes)
    document.ps930IdArchive = expedient.ps930IdArchive
    document.ps950IdExpedient = expedient.idExpedient
    document.ps952IdFolder = folder.idFolder
    document.folio_start = payload.folio_start
    document.folio_end = payload.folio_end
    document.folio_total = total
    expedient.folio_count += total
    folder.folio_count += total
    db.add(item)
    movement = KardexMovement(
        movement_type="foliation_validated",
        entity_type="document",
        entity_id=document.idDocument,
        ps930DestinationArchiveId=expedient.ps930IdArchive,
        ps405ActorIdentification=user.identification,
        status="accepted",
        observations=f"Foliacion validada: {payload.folio_start}-{payload.folio_end}",
        metadata_json={"folio_start": payload.folio_start, "folio_end": payload.folio_end, "total": total},
    )
    db.add(movement)
    db.flush()
    _trace(db, movement.idMovement, "foliation_validated", user, request, movement.observations)
    write_audit(db, action="document_foliated", module="archives", user_id=user.identification, entity="document", entity_id=document.idDocument, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/repository")
def repository(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    rows = db.query(Document).filter(Document.ps930IdArchive.in_(ids)).order_by(Document.created_at.desc()).limit(100).all()
    return [
        {
            "idDocument": document.idDocument,
            "document_name": document.document_name,
            "archive_id": document.ps930IdArchive,
            "expedient_id": document.ps950IdExpedient,
            "folder_id": document.ps952IdFolder,
            "files": [
                {"idFile": file.idFile, "original_name": file.original_name, "content_type": file.content_type, "checksum": file.checksum, "size_bytes": file.size_bytes}
                for file in document.files
            ],
        }
        for document in rows
    ]


@router.get("/repository/files/{file_id}/download")
def repository_file_download(file_id: int, request: Request, user: User = Depends(require_permission("document.download")), db: Session = Depends(get_db)):
    item = db.get(DocumentFile, file_id)
    if not item:
        raise HTTPException(status_code=404, detail="File not found")
    document = db.get(Document, item.ps520IdDocument)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if not document.ps930IdArchive:
        raise HTTPException(status_code=400, detail="Document has no archive context")
    _require_archive_access(db, user, document.ps930IdArchive)
    write_audit(
        db,
        action="document_file_download_requested",
        module="repository",
        user_id=user.identification,
        archive_id=document.ps930IdArchive,
        entity="document_file",
        entity_id=item.idFile,
        entity_label=item.original_name,
        new_values={"document_id": document.idDocument, "checksum": item.checksum},
        request=request,
    )
    db.commit()
    return {"download_url": presigned_url(item.file_path), "expires_in_seconds": 600, "checksum": item.checksum, "original_name": item.original_name}


@router.get("/kardex")
def kardex_timeline(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    return db.query(KardexMovement).filter(or_(KardexMovement.ps930OriginArchiveId.in_(ids), KardexMovement.ps930DestinationArchiveId.in_(ids))).order_by(KardexMovement.created_at.desc()).limit(100).all()


@router.post("/kardex", status_code=status.HTTP_201_CREATED)
def create_movement(payload: MovementCreate, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    entity_archive_id = _movement_archive_for_entity(db, payload.entity_type, payload.entity_id)
    if payload.movement_type == "transfer":
        if not payload.origin_archive_id or not payload.destination_archive_id:
            raise HTTPException(status_code=422, detail="Transfer requires origin and destination archive")
        if entity_archive_id and entity_archive_id != payload.origin_archive_id:
            raise HTTPException(status_code=422, detail="Entity does not belong to origin archive")
    if payload.origin_archive_id:
        _require_archive_access(db, user, payload.origin_archive_id, {"operate", "admin"})
    if payload.destination_archive_id:
        _require_archive_access(db, user, payload.destination_archive_id)
    if payload.movement_type == "transfer" and payload.entity_type in {"document", "folder", "expedient"}:
        if payload.entity_type == "document":
            document = db.get(Document, payload.entity_id)
            if document and (not document.folio_start or not document.folio_end):
                raise HTTPException(status_code=422, detail="Document must be foliated before transfer")
        if payload.entity_type == "expedient":
            pending = db.query(Document).filter(Document.ps950IdExpedient == payload.entity_id, Document.folio_total.is_(None)).count()
            if pending:
                raise HTTPException(status_code=422, detail="Expedient has documents without foliation")
    item = KardexMovement(
        movement_type=payload.movement_type,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        ps930OriginArchiveId=payload.origin_archive_id,
        ps930DestinationArchiveId=payload.destination_archive_id,
        ps405ActorIdentification=user.identification,
        custodian_from=payload.custodian_from,
        custodian_to=payload.custodian_to,
        status="pending_reception" if payload.movement_type == "transfer" else "pending",
        observations=payload.observations,
        metadata_json=payload.metadata,
    )
    db.add(item)
    db.flush()
    _trace(db, item.idMovement, item.status, user, request, payload.observations)
    destination_archive = db.get(Archive, payload.destination_archive_id) if payload.destination_archive_id else None
    _notify(db, destination_archive.custodian_identification if destination_archive else None, "custody", f"Recepcion pendiente: {payload.entity_type} #{payload.entity_id}", f"/kardex?movement={item.idMovement}")
    write_audit(db, action="kardex_movement_created", module="archives", user_id=user.identification, entity="kardex_movement", entity_id=item.idMovement, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/kardex/{movement_id}/decision")
def decide_movement(movement_id: int, payload: MovementDecision, request: Request, user: User = Depends(require_permission("transfer.manage")), db: Session = Depends(get_db)):
    item = db.get(KardexMovement, movement_id)
    if not item:
        raise HTTPException(status_code=404, detail="Movement not found")
    if item.ps930DestinationArchiveId:
        _require_archive_access(db, user, item.ps930DestinationArchiveId, {"operate", "admin"})
    if payload.status == "rejected" and not payload.reason:
        raise HTTPException(status_code=422, detail="Rejection reason is required")
    old_status = item.status
    item.status = payload.status
    item.reason = payload.reason
    item.observations = payload.observations or item.observations
    if payload.status in {"accepted", "received", "partially_received"}:
        _apply_custody_change(db, item)
        if item.entity_type == "document":
            document = db.get(Document, item.entity_id)
            if document:
                document.status = "active"
        elif item.entity_type == "folder":
            folder = db.get(Folder, item.entity_id)
            if folder:
                folder.status = "active"
        elif item.entity_type == "expedient":
            expedient = db.get(Expedient, item.entity_id)
            if expedient:
                expedient.status = "active"
    elif payload.status == "rejected":
        _notify(db, item.ps405ActorIdentification, "custody", f"Transferencia rechazada: {item.entity_type} #{item.entity_id}", f"/kardex?movement={item.idMovement}")
    _trace(db, item.idMovement, payload.status, user, request, payload.reason or payload.observations)
    write_audit(db, action="kardex_movement_decided", module="archives", user_id=user.identification, entity="kardex_movement", entity_id=item.idMovement, old_values={"status": old_status}, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.post("/loans", status_code=status.HTTP_201_CREATED)
def create_loan(payload: LoanCreate, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    _require_archive_access(db, user, payload.archive_id, {"operate", "admin"})
    entity_archive_id = _movement_archive_for_entity(db, payload.entity_type, payload.entity_id)
    if entity_archive_id and entity_archive_id != payload.archive_id:
        raise HTTPException(status_code=422, detail="Entity does not belong to archive")
    if payload.due_at:
        due_at = payload.due_at if payload.due_at.tzinfo else payload.due_at.replace(tzinfo=UTC)
        if due_at.date() < datetime.now(UTC).date():
            raise HTTPException(status_code=422, detail="Expected return date cannot be in the past")
    active_loans = _active_loans_for_entity(db, payload.entity_type, payload.entity_id)
    if active_loans:
        raise HTTPException(status_code=409, detail="Documentary unit already has an active loan")
    pending_transfer = _pending_transfer_for_entity(db, payload.entity_type, payload.entity_id)
    if pending_transfer:
        raise HTTPException(status_code=409, detail="Documentary unit is already in a pending transfer")
    initial_status = "due_today" if payload.due_at and (payload.due_at if payload.due_at.tzinfo else payload.due_at.replace(tzinfo=UTC)).date() == datetime.now(UTC).date() else "active"
    item = DocumentLoan(
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        ps930IdArchive=payload.archive_id,
        requested_by=payload.requested_by,
        approved_by=user.identification,
        due_at=payload.due_at,
        status=initial_status,
        observations=payload.observations,
        evidence={
            "requester_identification": payload.requester_identification,
            "requester_area": payload.requester_area,
            "requester_contact": payload.requester_contact,
            "reason": payload.reason,
            "delivery_evidence_url": payload.delivery_evidence_url,
            "authorized_by": user.identification,
        },
    )
    db.add(item)
    db.flush()
    _set_entity_loan_status(db, payload.entity_type, payload.entity_id, "borrowed")
    item.evidence = {**_loan_evidence(item), "loan_code": _loan_code(item)}
    flag_modified(item, "evidence")
    _loan_kardex(db, request, user, item, "loan.created", None, payload.observations or "Prestamo documental creado.")
    _loan_kardex(db, request, user, item, "loan.borrowed", None, f"Unidad documental prestada a {payload.requested_by}.")
    _notify(db, user.identification, "custody", f"Prestamo {_loan_code(item)} registrado", f"/loans?loan={item.idLoan}")
    write_audit(db, action="loan_created", module="archives", user_id=user.identification, entity="loan", entity_id=item.idLoan, new_values=_loan_to_dict(db, item), request=request)
    db.commit()
    db.refresh(item)
    return _loan_to_dict(db, item)


@router.get("/loans")
def list_loans(
    request: Request,
    archive_id: int | None = None,
    status_filter: str | None = None,
    entity_type: str | None = None,
    search: str | None = None,
    user: User = Depends(require_permission("document.read")),
    db: Session = Depends(get_db),
):
    ids = allowed_archive_ids(db, user)
    if not ids:
        return []
    _refresh_loan_due_statuses(db, request, user, ids)
    query = db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive.in_(ids))
    if archive_id:
        _require_archive_access(db, user, archive_id)
        query = query.filter(DocumentLoan.ps930IdArchive == archive_id)
    if status_filter:
        query = query.filter(DocumentLoan.status == status_filter)
    if entity_type:
        query = query.filter(DocumentLoan.entity_type == entity_type)
    rows = [_loan_to_dict(db, item) for item in query.order_by(DocumentLoan.created_at.desc()).limit(250).all()]
    if search:
        text = search.lower().strip()
        rows = [item for item in rows if text in f"{item['loan_code']} {item['entity_type']} {item['entity_id']} {item['requested_by']} {item.get('requester_identification') or ''} {item.get('archive_name') or ''} {item['status']}".lower()]
    db.commit()
    return rows


@router.get("/loans/summary")
def loans_summary(request: Request, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    if not ids:
        return {"active": 0, "due_today": 0, "overdue": 0, "returned_this_month": 0, "by_entity_type": {}, "by_archive": []}
    _refresh_loan_due_statuses(db, request, user, ids)
    now = datetime.now(UTC)
    rows = db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive.in_(ids)).all()
    by_entity_type: dict[str, int] = {}
    for loan in rows:
        if loan.status in ACTIVE_LOAN_STATUSES:
            by_entity_type[loan.entity_type] = by_entity_type.get(loan.entity_type, 0) + 1
    by_archive = []
    for archive in db.query(Archive).filter(Archive.idArchive.in_(ids)).order_by(Archive.archive_name.asc()).all():
        by_archive.append({
            "archive_id": archive.idArchive,
            "archive_name": archive.archive_name,
            "active": db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive == archive.idArchive, DocumentLoan.status.in_(ACTIVE_LOAN_STATUSES)).count(),
            "overdue": db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive == archive.idArchive, DocumentLoan.status == "overdue").count(),
        })
    db.commit()
    return {
        "active": sum(1 for item in rows if item.status in ACTIVE_LOAN_STATUSES),
        "due_today": sum(1 for item in rows if item.status == "due_today"),
        "overdue": sum(1 for item in rows if item.status == "overdue"),
        "returned_this_month": sum(1 for item in rows if item.status == "returned" and item.returned_at and item.returned_at.month == now.month and item.returned_at.year == now.year),
        "by_entity_type": by_entity_type,
        "by_archive": by_archive,
    }


@router.post("/loans/check-overdue")
def check_overdue_loans(request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    updated = _refresh_loan_due_statuses(db, request, user, ids)
    db.commit()
    return {"updated": updated}


@router.get("/loans/export")
def export_loans(request: Request, format: str = Query(default="csv", pattern="^(csv|xlsx)$"), user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    _refresh_loan_due_statuses(db, request, user, ids)
    rows = [_loan_to_dict(db, item) for item in db.query(DocumentLoan).filter(DocumentLoan.ps930IdArchive.in_(ids)).order_by(DocumentLoan.created_at.desc()).all()]
    lines = ["loan_code,archive,entity_type,entity_id,requester,status,due_at,returned_at,location"]
    for item in rows:
        lines.append(",".join([
            str(item["loan_code"]),
            str(item.get("archive_name") or ""),
            str(item["entity_type"]),
            str(item["entity_id"]),
            str(item["requested_by"]),
            str(item["status"]),
            item["due_at"].isoformat() if item["due_at"] else "",
            item["returned_at"].isoformat() if item["returned_at"] else "",
            str(item.get("current_location_path") or ""),
        ]))
    content = "\n".join(lines)
    write_audit(db, action="loans_exported", module="archives", user_id=user.identification, entity="loan", entity_id=0, new_values={"format": format, "rows": len(rows)}, request=request)
    db.commit()
    if format == "xlsx":
        return Response(content=_xlsx_from_lines(lines), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=prestamos_documentales.xlsx"})
    return Response(content=content, media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=prestamos_documentales.csv"})


@router.get("/loans/{loan_id}")
def get_loan(loan_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    loan = db.get(DocumentLoan, loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    _require_archive_access(db, user, loan.ps930IdArchive)
    return _loan_to_dict(db, loan)


@router.patch("/loans/{loan_id}/return")
@router.post("/loans/{loan_id}/return")
def return_loan(loan_id: int, payload: LoanReturn, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    loan = db.get(DocumentLoan, loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    _require_archive_access(db, user, loan.ps930IdArchive, {"operate", "admin"})
    if loan.status not in ACTIVE_LOAN_STATUSES:
        raise HTTPException(status_code=409, detail="Loan is not active")
    old_status = loan.status
    loan.status = "returned"
    loan.returned_at = datetime.now(UTC)
    evidence = {**_loan_evidence(loan), **payload.evidence}
    if payload.return_evidence_url:
        evidence["return_evidence_url"] = payload.return_evidence_url
    evidence["return_observations"] = payload.observations
    loan.evidence = evidence
    loan.observations = payload.observations or loan.observations
    flag_modified(loan, "evidence")
    _set_entity_loan_status(db, loan.entity_type, loan.entity_id, "active")
    _loan_kardex(db, request, user, loan, "loan.returned", old_status, payload.observations or "Devolucion documental registrada.")
    resolve_notifications(db, user_id=loan.approved_by, module="custody", related_entity_type="loan", related_entity_id=loan.idLoan)
    resolve_related_tasks(db, related_entity_type="loan", related_entity_id=loan.idLoan, module="custody", note="Prestamo devuelto.", completed_by=user.identification)
    notify_action(db, user_id=loan.approved_by, archive_id=loan.ps930IdArchive, module="custody", title=f"Prestamo {_loan_code(loan)} devuelto", message="La unidad documental regreso a custodia.", priority="normal", notification_type="loan_returned", related_entity_type="loan", related_entity_id=loan.idLoan, action_label="Ver prestamo", action_url=f"/loans?loan={loan.idLoan}")
    write_audit(db, action="loan_returned", module="archives", user_id=user.identification, entity="loan", entity_id=loan.idLoan, old_values={"status": old_status}, new_values=_loan_to_dict(db, loan), request=request)
    db.commit()
    db.refresh(loan)
    return _loan_to_dict(db, loan)


@router.post("/loans/{loan_id}/cancel")
def cancel_loan(loan_id: int, payload: LoanCancel, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    loan = db.get(DocumentLoan, loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    _require_archive_access(db, user, loan.ps930IdArchive, {"operate", "admin"})
    if loan.status not in ACTIVE_LOAN_STATUSES and loan.status != "draft":
        raise HTTPException(status_code=409, detail="Loan cannot be cancelled")
    old_status = loan.status
    loan.status = "cancelled"
    evidence = _loan_evidence(loan)
    evidence["cancel_reason"] = payload.reason
    loan.evidence = evidence
    flag_modified(loan, "evidence")
    loan.observations = payload.observations or loan.observations
    _set_entity_loan_status(db, loan.entity_type, loan.entity_id, "active")
    _loan_kardex(db, request, user, loan, "loan.cancelled", old_status, payload.observations or payload.reason)
    resolve_notifications(db, user_id=loan.approved_by, module="custody", related_entity_type="loan", related_entity_id=loan.idLoan)
    resolve_related_tasks(db, related_entity_type="loan", related_entity_id=loan.idLoan, module="custody", note="Prestamo cancelado.", completed_by=user.identification)
    write_audit(db, action="loan_cancelled", module="archives", user_id=user.identification, entity="loan", entity_id=loan.idLoan, old_values={"status": old_status}, new_values=_loan_to_dict(db, loan), request=request)
    db.commit()
    db.refresh(loan)
    return _loan_to_dict(db, loan)


@router.post("/loans/{loan_id}/delivery-evidence")
def add_loan_delivery_evidence(loan_id: int, payload: LoanEvidencePayload, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    loan = db.get(DocumentLoan, loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    _require_archive_access(db, user, loan.ps930IdArchive, {"operate", "admin"})
    evidence = _loan_evidence(loan)
    evidence["delivery_evidence_url"] = payload.evidence_url
    evidence["delivery_evidence_observation"] = payload.observation
    loan.evidence = evidence
    flag_modified(loan, "evidence")
    _loan_kardex(db, request, user, loan, "loan.evidence_added", loan.status, payload.observation or "Evidencia de entrega agregada.")
    write_audit(db, action="loan_delivery_evidence_added", module="archives", user_id=user.identification, entity="loan", entity_id=loan.idLoan, new_values=payload.model_dump(), request=request)
    db.commit()
    return _loan_to_dict(db, loan)


@router.post("/loans/{loan_id}/return-evidence")
def add_loan_return_evidence(loan_id: int, payload: LoanEvidencePayload, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    loan = db.get(DocumentLoan, loan_id)
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    _require_archive_access(db, user, loan.ps930IdArchive, {"operate", "admin"})
    evidence = _loan_evidence(loan)
    evidence["return_evidence_url"] = payload.evidence_url
    evidence["return_evidence_observation"] = payload.observation
    loan.evidence = evidence
    flag_modified(loan, "evidence")
    _loan_kardex(db, request, user, loan, "loan.evidence_added", loan.status, payload.observation or "Evidencia de devolucion agregada.")
    write_audit(db, action="loan_return_evidence_added", module="archives", user_id=user.identification, entity="loan", entity_id=loan.idLoan, new_values=payload.model_dump(), request=request)
    db.commit()
    return _loan_to_dict(db, loan)


@router.get("/entities/{entity_type}/{entity_id}/loans")
def entity_loans(entity_type: str, entity_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    archive_id = _movement_archive_for_entity(db, entity_type, entity_id)
    _require_archive_access(db, user, archive_id)
    conditions = _loan_unit_conditions(_related_units_for_loan(db, entity_type, entity_id))
    if not conditions:
        return []
    return [_loan_to_dict(db, item) for item in db.query(DocumentLoan).filter(or_(*conditions)).order_by(DocumentLoan.created_at.desc()).all()]


@router.get("/expedients/{expedient_id}/loans")
def expedient_loans(expedient_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    expedient = _get_expedient_for_user(db, user, expedient_id)
    conditions = _loan_unit_conditions(_related_units_for_loan(db, "expedient", expedient.idExpedient))
    return [_loan_to_dict(db, item) for item in db.query(DocumentLoan).filter(or_(*conditions)).order_by(DocumentLoan.created_at.desc()).all()]


@router.get("/fuid")
def list_fuid(archive_id: int | None = None, status_filter: str | None = None, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    query = db.query(InventoryFuid).filter(InventoryFuid.ps930IdArchive.in_(ids))
    if archive_id:
        _require_archive_access(db, user, archive_id)
        query = query.filter(InventoryFuid.ps930IdArchive == archive_id)
    rows = [_fuid_to_dict(item) for item in query.order_by(InventoryFuid.created_at.desc()).all()]
    if status_filter:
        rows = [item for item in rows if item["status"] == status_filter]
    return rows


@router.get("/fuid.csv")
def export_fuid_csv(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    rows = db.query(InventoryFuid).filter(InventoryFuid.ps930IdArchive.in_(ids)).order_by(InventoryFuid.created_at.desc()).all()
    lines = ["fuid_code,archive_id,expedient_id,transfer_id,status,version,support_type,folio_total,items,inconsistencies,location_summary,observations"]
    for item in rows:
        metadata = item.metadata_json or {}
        lines.append(
            f"{item.fuid_code},{item.ps930IdArchive},{item.ps950IdExpedient or ''},{item.ps1070IdBatch or ''},{metadata.get('status', 'generated')},{metadata.get('version', 1)},{item.support_type},{item.folio_total},{len(metadata.get('items', []))},{sum(1 for record in metadata.get('items', []) if record.get('inconsistencies'))},{(item.location_summary or '').replace(',', ' ')},{(item.observations or '').replace(',', ' ')}"
        )
    return "\n".join(lines)


@router.get("/fuid/{fuid_id}")
def get_fuid(fuid_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    return _fuid_to_dict(_require_fuid_access(db, user, fuid_id))


@router.post("/fuid/expedients/{expedient_id}", status_code=status.HTTP_201_CREATED)
def generate_fuid(expedient_id: int, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    expedient = db.get(Expedient, expedient_id)
    if not expedient:
        raise HTTPException(status_code=404, detail="Expedient not found")
    _require_archive_access(db, user, expedient.ps930IdArchive, {"operate", "admin"})
    records = _fuid_records_from_expedient(db, expedient)
    code = f"FUID-{expedient.expedient_code}-{int(datetime.now(UTC).timestamp())}"
    item = InventoryFuid(
        fuid_code=code,
        ps930IdArchive=expedient.ps930IdArchive,
        ps950IdExpedient=expedient.idExpedient,
        support_type="hybrid" if any(record["support_type"] == "digital" for record in records) else "physical",
        folio_total=sum(record.get("total_folios_declared") or 0 for record in records if record["documentary_unit_type"] == "document"),
        location_summary=_physical_location_path(db, "expedient", expedient.idExpedient) or expedient.physical_location,
        observations="FUID generado desde expediente vivo",
        metadata_json={
            "status": "generated",
            "version": 1,
            "source": "expedient",
            "expedient_code": expedient.expedient_code,
            "archive_origin_id": expedient.ps930IdArchive,
            "series_id": expedient.ps610IdSeries,
            "subseries_id": expedient.ps612IdSubseries,
            "created_by": user.identification,
            "generated_at": datetime.now(UTC).isoformat(),
            "items": records,
            "versions": [],
            "evidences": {"delivery": [], "reception": []},
        },
    )
    db.add(item)
    db.flush()
    _fuid_movement(db, request, user, item, "fuid.generated", observation=f"FUID generado: {code}")
    write_audit(db, action="fuid_generated", module="archives", user_id=user.identification, entity="fuid", new_values={"code": code}, request=request)
    db.commit()
    db.refresh(item)
    return _fuid_to_dict(item)


@router.post("/fuid/from-expedient/{expedient_id}", status_code=status.HTTP_201_CREATED)
def generate_fuid_from_expedient(expedient_id: int, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    return generate_fuid(expedient_id, request, user, db)


@router.post("/fuid/from-transfer/{transfer_id}", status_code=status.HTTP_201_CREATED)
def generate_fuid_from_transfer(transfer_id: int, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    batch = db.get(TransferBatch, transfer_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if batch.ps930OriginArchiveId:
        _require_archive_access(db, user, batch.ps930OriginArchiveId, {"operate", "admin"})
    if batch.ps930DestinationArchiveId:
        _require_archive_access(db, user, batch.ps930DestinationArchiveId)
    existing = db.query(InventoryFuid).filter(InventoryFuid.ps1070IdBatch == batch.idBatch).order_by(InventoryFuid.created_at.desc()).first()
    if existing:
        return _fuid_to_dict(existing)
    records = _fuid_records_from_transfer(db, batch)
    code = f"FUID-{batch.batch_code}-{int(datetime.now(UTC).timestamp())}"
    item = InventoryFuid(
        fuid_code=code,
        ps930IdArchive=batch.ps930OriginArchiveId or batch.ps930DestinationArchiveId or 1,
        ps1070IdBatch=batch.idBatch,
        support_type="hybrid",
        folio_total=sum(record.get("total_folios_declared") or 0 for record in records),
        location_summary=f"Transferencia {batch.batch_code}: archivo {batch.ps930OriginArchiveId} -> {batch.ps930DestinationArchiveId}",
        observations="FUID generado desde transferencia documental",
        metadata_json={
            "status": "generated",
            "version": 1,
            "source": "transfer",
            "batch_code": batch.batch_code,
            "archive_origin_id": batch.ps930OriginArchiveId,
            "archive_destination_id": batch.ps930DestinationArchiveId,
            "created_by": user.identification,
            "generated_at": datetime.now(UTC).isoformat(),
            "items": records,
            "versions": [],
            "evidences": {"delivery": [], "reception": []},
        },
    )
    db.add(item)
    db.flush()
    _fuid_movement(db, request, user, item, "fuid.generated", observation=f"FUID generado para transferencia: {batch.batch_code}")
    write_audit(db, action="fuid_generated_from_transfer", module="archives", user_id=user.identification, entity="fuid", entity_id=item.idFuid, new_values={"transfer_id": batch.idBatch, "code": code}, request=request)
    db.commit()
    db.refresh(item)
    return _fuid_to_dict(item)


@router.post("/fuid/{fuid_id}/regenerate")
def regenerate_fuid(fuid_id: int, payload: FuidRegeneratePayload, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    item = _require_fuid_access(db, user, fuid_id, {"operate", "admin"})
    old_metadata = dict(item.metadata_json or {})
    versions = list(old_metadata.get("versions", []))
    versions.append({"version": old_metadata.get("version", 1), "snapshot_at": datetime.now(UTC).isoformat(), "items": old_metadata.get("items", []), "status": old_metadata.get("status", "generated"), "reason": payload.reason})
    if item.ps950IdExpedient:
        records = _fuid_records_from_expedient(db, db.get(Expedient, item.ps950IdExpedient))
    elif item.ps1070IdBatch:
        records = _fuid_records_from_transfer(db, db.get(TransferBatch, item.ps1070IdBatch))
    else:
        records = old_metadata.get("items", [])
    old_status = old_metadata.get("status", "generated")
    item.folio_total = sum(record.get("total_folios_declared") or 0 for record in records if record.get("documentary_unit_type") in {"document", "folder", "expedient", "box"})
    item.metadata_json = {**old_metadata, "items": records, "versions": versions, "version": old_metadata.get("version", 1) + 1, "status": "generated", "regenerated_at": datetime.now(UTC).isoformat(), "regenerated_by": user.identification, "regeneration_reason": payload.reason}
    flag_modified(item, "metadata_json")
    _fuid_movement(db, request, user, item, "fuid.regenerated", old_status=old_status, observation=payload.reason or "FUID regenerado")
    write_audit(db, action="fuid_regenerated", module="archives", user_id=user.identification, entity="fuid", entity_id=item.idFuid, old_values=old_metadata, new_values=item.metadata_json, request=request)
    db.commit()
    db.refresh(item)
    return _fuid_to_dict(item)


@router.get("/fuid/{fuid_id}/compare-reception")
def compare_fuid_reception(fuid_id: int, request: Request, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    item = _require_fuid_access(db, user, fuid_id)
    metadata = item.metadata_json or {}
    batch = db.get(TransferBatch, item.ps1070IdBatch) if item.ps1070IdBatch else None
    if not batch:
        return {"fuid": _fuid_to_dict(item), "items": [], "summary": {"match": 0, "pending_review": 0, "inconsistencies": 0}}
    transfer_items = {(row.entity_type, row.entity_id): row for row in db.query(TransferBatchItem).filter(TransferBatchItem.ps1070IdBatch == batch.idBatch).all()}
    compared = []
    for record in metadata.get("items", []):
        row = transfer_items.get((record["documentary_unit_type"], record["documentary_unit_id"]))
        status_value = "missing" if not row else "match"
        inconsistencies = []
        if row:
            if row.status in {"rejected", "partially_received", "with_inconsistency"}:
                status_value = row.status
                inconsistencies.append(row.rejection_reason or "reception_inconsistency")
            declared_folios = record.get("total_folios_declared") or 0
            if row.received_folios is not None and row.received_folios != declared_folios:
                status_value = "folio_mismatch"
                inconsistencies.append("folio_mismatch")
            if row.received_quantity is not None and row.received_quantity != (record.get("quantity_declared") or 1):
                status_value = "quantity_mismatch"
                inconsistencies.append("quantity_mismatch")
            if row.status in {"pending", "pending_review"}:
                status_value = "pending_review"
        compared.append({"declared": record, "received": _transfer_item_to_dict(row), "comparison_status": status_value, "inconsistencies": list(dict.fromkeys(inconsistencies))})
    summary = {
        "match": sum(1 for row in compared if row["comparison_status"] == "match"),
        "pending_review": sum(1 for row in compared if row["comparison_status"] == "pending_review"),
        "inconsistencies": sum(1 for row in compared if row["comparison_status"] not in {"match", "pending_review"}),
    }
    _fuid_movement(db, request, user, item, "fuid.compared", old_status=metadata.get("status"), observation="Comparacion FUID vs recepcion")
    write_audit(db, action="fuid_compared", module="archives", user_id=user.identification, entity="fuid", entity_id=item.idFuid, new_values=summary, request=request)
    db.commit()
    return {"fuid": _fuid_to_dict(item), "items": compared, "summary": summary}


@router.post("/fuid/{fuid_id}/delivery-evidence")
def add_fuid_delivery_evidence(fuid_id: int, payload: FuidEvidencePayload, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    item = _require_fuid_access(db, user, fuid_id, {"operate", "admin"})
    metadata = dict(item.metadata_json or {})
    evidences = dict(metadata.get("evidences") or {"delivery": [], "reception": []})
    evidence = {"by": user.identification, "at": datetime.now(UTC).isoformat(), "observation": payload.observation, "evidence_url": payload.evidence_url}
    evidences.setdefault("delivery", []).append(evidence)
    old_status = metadata.get("status", "generated")
    metadata["evidences"] = evidences
    item.metadata_json = metadata
    flag_modified(item, "metadata_json")
    _fuid_movement(db, request, user, item, "delivery.evidence_added", old_status=old_status, observation=payload.observation, evidence_url=payload.evidence_url)
    write_audit(db, action="fuid_delivery_evidence_added", module="archives", user_id=user.identification, entity="fuid", entity_id=item.idFuid, new_values=evidence, request=request)
    db.commit()
    db.refresh(item)
    return _fuid_to_dict(item)


@router.post("/fuid/{fuid_id}/reception-evidence")
def add_fuid_reception_evidence(fuid_id: int, payload: FuidEvidencePayload, request: Request, user: User = Depends(require_permission("transfer.batch_manage")), db: Session = Depends(get_db)):
    item = _require_fuid_access(db, user, fuid_id, {"operate", "admin"})
    metadata = dict(item.metadata_json or {})
    evidences = dict(metadata.get("evidences") or {"delivery": [], "reception": []})
    evidence = {"by": user.identification, "at": datetime.now(UTC).isoformat(), "result": payload.result, "observation": payload.observation, "evidence_url": payload.evidence_url}
    evidences.setdefault("reception", []).append(evidence)
    old_status = metadata.get("status", "generated")
    if payload.result:
        metadata["status"] = payload.result
    metadata["evidences"] = evidences
    item.metadata_json = metadata
    flag_modified(item, "metadata_json")
    _fuid_movement(db, request, user, item, "reception.evidence_added", old_status=old_status, observation=payload.observation, evidence_url=payload.evidence_url)
    write_audit(db, action="fuid_reception_evidence_added", module="archives", user_id=user.identification, entity="fuid", entity_id=item.idFuid, old_values={"status": old_status}, new_values=evidence, request=request)
    db.commit()
    db.refresh(item)
    return _fuid_to_dict(item)


@router.get("/fuid/{fuid_id}/export")
def export_fuid(fuid_id: int, request: Request, format: str = Query(default="csv", pattern="^(csv|xlsx)$"), user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    item = _require_fuid_access(db, user, fuid_id)
    lines = _fuid_csv_lines(item)
    _fuid_movement(db, request, user, item, "fuid.exported", old_status=(item.metadata_json or {}).get("status"), observation=f"Export FUID {format}")
    write_audit(db, action="fuid_exported", module="archives", user_id=user.identification, entity="fuid", entity_id=item.idFuid, new_values={"format": format}, request=request)
    db.commit()
    filename = f"{item.fuid_code}.{format}"
    if format == "xlsx":
        return Response(_xlsx_from_lines(lines), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename={filename}"})
    return Response("\n".join(lines), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.post("/fuid/{fuid_id}/close")
def close_fuid(fuid_id: int, payload: FuidEvidencePayload, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    item = _require_fuid_access(db, user, fuid_id, {"operate", "admin"})
    metadata = dict(item.metadata_json or {})
    old_status = metadata.get("status", "generated")
    metadata["status"] = "closed"
    metadata["closed_by"] = user.identification
    metadata["closed_at"] = datetime.now(UTC).isoformat()
    metadata["close_observation"] = payload.observation
    item.metadata_json = metadata
    flag_modified(item, "metadata_json")
    _fuid_movement(db, request, user, item, "fuid.closed", old_status=old_status, observation=payload.observation)
    write_audit(db, action="fuid_closed", module="archives", user_id=user.identification, entity="fuid", entity_id=item.idFuid, old_values={"status": old_status}, new_values={"status": "closed"}, request=request)
    db.commit()
    db.refresh(item)
    return _fuid_to_dict(item)


@router.get("/fuid/{fuid_id}/versions")
def fuid_versions(fuid_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    item = _require_fuid_access(db, user, fuid_id)
    return (item.metadata_json or {}).get("versions", [])


@router.get("/fuid/{fuid_id}/audit")
def fuid_audit(fuid_id: int, user: User = Depends(require_permission("audit.read")), db: Session = Depends(get_db)):
    _require_fuid_access(db, user, fuid_id)
    return db.query(AuditLog).filter(AuditLog.entity == "fuid", AuditLog.entity_id == str(fuid_id)).order_by(AuditLog.created_at.desc()).limit(100).all()


@router.get("/fuid/{fuid_id}/kardex")
def fuid_kardex(fuid_id: int, user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    _require_fuid_access(db, user, fuid_id)
    return db.query(KardexMovement).filter(KardexMovement.entity_type == "fuid", KardexMovement.entity_id == fuid_id).order_by(KardexMovement.created_at.desc()).all()
