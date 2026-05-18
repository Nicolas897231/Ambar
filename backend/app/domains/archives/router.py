from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import (
    Archive,
    ArchiveUser,
    Document,
    DocumentLoan,
    Expedient,
    Folder,
    Foliation,
    InventoryFuid,
    KardexMovement,
    MovementTrace,
    PhysicalBox,
    Shelf,
    TrdSeries,
    TrdSubseries,
    User,
)
from app.db.session import get_db
from app.services.audit import write_audit

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
    series_id: int | None = None
    subseries_id: int | None = None
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


class FoliationCreate(BaseModel):
    document_id: int
    expedient_id: int
    folder_id: int
    folio_start: int = Field(ge=1)
    folio_end: int = Field(ge=1)
    electronic_folios: int = Field(default=0, ge=0)
    annexes: str | None = None


class MovementCreate(BaseModel):
    movement_type: str = Field(pattern="^(transfer|loan|return|reception|rejection|location_change|digital_move)$")
    entity_type: str = Field(pattern="^(document|folder|box|expedient|batch)$")
    entity_id: int
    origin_archive_id: int | None = None
    destination_archive_id: int | None = None
    custodian_from: str | None = None
    custodian_to: str | None = None
    observations: str | None = None
    metadata: dict = Field(default_factory=dict)


class MovementDecision(BaseModel):
    status: str = Field(pattern="^(accepted|rejected|received|returned)$")
    reason: str | None = None
    observations: str | None = None


class LoanCreate(BaseModel):
    entity_type: str = Field(default="folder", pattern="^(document|folder|box|expedient)$")
    entity_id: int
    archive_id: int
    requested_by: str
    due_at: datetime | None = None
    observations: str | None = None


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
    if payload.series_id and not db.get(TrdSeries, payload.series_id):
        raise HTTPException(status_code=422, detail="TRD series not found")
    if payload.subseries_id and not db.get(TrdSubseries, payload.subseries_id):
        raise HTTPException(status_code=422, detail="TRD subseries not found")
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
    write_audit(db, action="expedient_created", module="archives", user_id=user.identification, entity="expedient", entity_id=item.idExpedient, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


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
    write_audit(db, action="folder_created", module="archives", user_id=user.identification, entity="folder", entity_id=item.idFolder, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.post("/shelves", status_code=status.HTTP_201_CREATED)
def create_shelf(payload: ShelfCreate, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    _require_archive_access(db, user, payload.archive_id, {"admin"})
    item = Shelf(ps930IdArchive=payload.archive_id, shelf_code=payload.shelf_code, shelf_name=payload.shelf_name, capacity_boxes=payload.capacity_boxes, physical_location=payload.physical_location)
    db.add(item)
    write_audit(db, action="shelf_created", module="archives", user_id=user.identification, entity="shelf", new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.post("/boxes", status_code=status.HTTP_201_CREATED)
def create_box(payload: BoxCreate, request: Request, user: User = Depends(require_permission("archive.manage")), db: Session = Depends(get_db)):
    archive = _require_archive_access(db, user, payload.archive_id, {"admin"})
    item = PhysicalBox(ps930IdArchive=payload.archive_id, ps934IdShelf=payload.shelf_id, box_code=payload.box_code, box_name=payload.box_name, capacity_folders=payload.capacity_folders)
    db.add(item)
    archive.box_count += 1
    write_audit(db, action="box_created", module="archives", user_id=user.identification, entity="box", new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


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


@router.get("/kardex")
def kardex_timeline(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    return db.query(KardexMovement).filter(or_(KardexMovement.ps930OriginArchiveId.in_(ids), KardexMovement.ps930DestinationArchiveId.in_(ids))).order_by(KardexMovement.created_at.desc()).limit(100).all()


@router.post("/kardex", status_code=status.HTTP_201_CREATED)
def create_movement(payload: MovementCreate, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    if payload.origin_archive_id:
        _require_archive_access(db, user, payload.origin_archive_id, {"operate", "admin"})
    if payload.destination_archive_id:
        _require_archive_access(db, user, payload.destination_archive_id)
    item = KardexMovement(
        movement_type=payload.movement_type,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        ps930OriginArchiveId=payload.origin_archive_id,
        ps930DestinationArchiveId=payload.destination_archive_id,
        ps405ActorIdentification=user.identification,
        custodian_from=payload.custodian_from,
        custodian_to=payload.custodian_to,
        status="in_transit" if payload.movement_type == "transfer" else "pending",
        observations=payload.observations,
        metadata_json=payload.metadata,
    )
    db.add(item)
    db.flush()
    _trace(db, item.idMovement, item.status, user, request, payload.observations)
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
    _trace(db, item.idMovement, payload.status, user, request, payload.reason or payload.observations)
    write_audit(db, action="kardex_movement_decided", module="archives", user_id=user.identification, entity="kardex_movement", entity_id=item.idMovement, old_values={"status": old_status}, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.post("/loans", status_code=status.HTTP_201_CREATED)
def create_loan(payload: LoanCreate, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    _require_archive_access(db, user, payload.archive_id, {"operate", "admin"})
    item = DocumentLoan(entity_type=payload.entity_type, entity_id=payload.entity_id, ps930IdArchive=payload.archive_id, requested_by=payload.requested_by, approved_by=user.identification, due_at=payload.due_at, observations=payload.observations)
    db.add(item)
    db.flush()
    movement = KardexMovement(movement_type="loan", entity_type=payload.entity_type, entity_id=payload.entity_id, ps930OriginArchiveId=payload.archive_id, ps405ActorIdentification=user.identification, custodian_to=payload.requested_by, status="active", observations=payload.observations)
    db.add(movement)
    db.flush()
    _trace(db, movement.idMovement, "loan_created", user, request, payload.observations)
    write_audit(db, action="loan_created", module="archives", user_id=user.identification, entity="loan", entity_id=item.idLoan, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/fuid")
def list_fuid(user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)):
    ids = allowed_archive_ids(db, user)
    return db.query(InventoryFuid).filter(InventoryFuid.ps930IdArchive.in_(ids)).order_by(InventoryFuid.created_at.desc()).all()


@router.post("/fuid/expedients/{expedient_id}", status_code=status.HTTP_201_CREATED)
def generate_fuid(expedient_id: int, request: Request, user: User = Depends(require_permission("document.transfer")), db: Session = Depends(get_db)):
    expedient = db.get(Expedient, expedient_id)
    if not expedient:
        raise HTTPException(status_code=404, detail="Expedient not found")
    _require_archive_access(db, user, expedient.ps930IdArchive, {"operate", "admin"})
    code = f"FUID-{expedient.expedient_code}-{int(datetime.now(UTC).timestamp())}"
    item = InventoryFuid(fuid_code=code, ps930IdArchive=expedient.ps930IdArchive, ps950IdExpedient=expedient.idExpedient, folio_total=expedient.folio_count, location_summary=expedient.physical_location, metadata_json={"expedient": expedient.expedient_name})
    db.add(item)
    write_audit(db, action="fuid_generated", module="archives", user_id=user.identification, entity="fuid", new_values={"code": code}, request=request)
    db.commit()
    db.refresh(item)
    return item
