from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import Archive, Document, Employee, Expedient, Folder, InventoryFuid, KardexMovement, PhysicalBox, User
from app.db.session import get_db
from app.domains.archives.router import allowed_archive_ids
from app.services.audit import write_audit
from app.services.search import index_document, search_documents

router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    q: str = ""
    entity_type: str | None = None
    archive_id: int | None = None
    document_type: str | None = None
    status: str | None = None
    location_id: int | None = None
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


def _doc_payload(document: Document) -> dict:
    return {
        "entity_type": "document",
        "id": document.idDocument,
        "title": document.document_name,
        "subtitle": document.document_type,
        "status": document.status,
        "archive_id": document.ps930IdArchive,
        "url": f"/documents?document={document.idDocument}",
        "idDocument": document.idDocument,
        "document_name": document.document_name,
        "document_type": document.document_type,
        "company_id": document.company_id,
        "location_id": document.location_id,
        "metadata": document.metadata_json or {},
        "version": document.version,
        "owner": document.ps405Identification,
        "created_at": document.created_at,
    }


def _result(entity_type: str, entity_id: int | str, title: str, subtitle: str | None, status: str | None, archive_id: int | None, url: str) -> dict:
    return {
        "entity_type": entity_type,
        "id": entity_id,
        "title": title,
        "subtitle": subtitle,
        "status": status,
        "archive_id": archive_id,
        "url": url,
    }


def _matches_text(column, term: str):
    return column.ilike(f"%{term}%")


@router.post("/documents")
def document_search(
    payload: SearchRequest,
    request: Request,
    user: User = Depends(require_permission("search.query")),
    db: Session = Depends(get_db),
):
    archive_ids = allowed_archive_ids(db, user)
    filters = {
        "company_id": user.company_id,
        "document_type": payload.document_type,
        "status": payload.status,
        "location_id": payload.location_id or user.location_id,
        "archive_id": payload.archive_id,
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

    if not archive_ids:
        return {"engine": "mysql_fallback", "total": 0, "items": []}

    requested_archive_ids = archive_ids
    if payload.archive_id is not None:
        if payload.archive_id not in archive_ids and "*" not in user_permissions(db, user):
            return {"engine": "mysql_fallback", "total": 0, "items": []}
        requested_archive_ids = [payload.archive_id]

    term = payload.q.strip()
    entity_filter = payload.entity_type
    results: list[dict] = []

    query = db.query(Document).filter(Document.company_id == user.company_id)
    query = query.filter(Document.ps930IdArchive.in_(requested_archive_ids))
    if term:
        query = query.filter(or_(_matches_text(Document.document_name, term), _matches_text(Document.document_type, term)))
    if payload.document_type:
        query = query.filter(Document.document_type == payload.document_type)
    if payload.status:
        query = query.filter(Document.status == payload.status)
    if payload.location_id:
        query = query.filter(Document.location_id == payload.location_id)
    if entity_filter in {None, "", "document"}:
        results.extend(_doc_payload(item) for item in query.order_by(Document.created_at.desc()).limit(200).all())

    if entity_filter in {None, "", "archive"}:
        archive_query = db.query(Archive).filter(Archive.idArchive.in_(requested_archive_ids))
        if term:
            archive_query = archive_query.filter(or_(_matches_text(Archive.archive_code, term), _matches_text(Archive.archive_name, term), _matches_text(Archive.archive_type, term)))
        if payload.status:
            archive_query = archive_query.filter(Archive.status == payload.status)
        results.extend(
            _result("archive", item.idArchive, item.archive_name, item.archive_code, item.status, item.idArchive, f"/archives?archive={item.idArchive}")
            for item in archive_query.order_by(Archive.archive_name.asc()).limit(100).all()
        )

    if entity_filter in {None, "", "expedient"}:
        expedient_query = db.query(Expedient).filter(Expedient.ps930IdArchive.in_(requested_archive_ids))
        if term:
            expedient_query = expedient_query.filter(or_(_matches_text(Expedient.expedient_code, term), _matches_text(Expedient.expedient_name, term), _matches_text(Expedient.expedient_type, term)))
        if payload.status:
            expedient_query = expedient_query.filter(Expedient.status == payload.status)
        results.extend(
            _result("expedient", item.idExpedient, item.expedient_name, item.expedient_code, item.status, item.ps930IdArchive, f"/expedients?expedient={item.idExpedient}")
            for item in expedient_query.order_by(Expedient.created_at.desc()).limit(100).all()
        )

    if entity_filter in {None, "", "folder"}:
        folder_query = db.query(Folder).filter(Folder.ps930IdArchive.in_(requested_archive_ids))
        if term:
            folder_query = folder_query.filter(or_(_matches_text(Folder.folder_code, term), _matches_text(Folder.folder_name, term)))
        if payload.status:
            folder_query = folder_query.filter(Folder.status == payload.status)
        results.extend(
            _result("folder", item.idFolder, item.folder_name, item.folder_code, item.status, item.ps930IdArchive, f"/folders?folder={item.idFolder}")
            for item in folder_query.order_by(Folder.created_at.desc()).limit(100).all()
        )

    if entity_filter in {None, "", "box"}:
        box_query = db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive.in_(requested_archive_ids))
        if term:
            box_query = box_query.filter(or_(_matches_text(PhysicalBox.box_code, term), _matches_text(PhysicalBox.box_name, term)))
        if payload.status:
            box_query = box_query.filter(PhysicalBox.status == payload.status)
        results.extend(
            _result("box", item.idBox, item.box_name or item.box_code, item.box_code, item.status, item.ps930IdArchive, f"/boxes?box={item.idBox}")
            for item in box_query.order_by(PhysicalBox.created_at.desc()).limit(100).all()
        )

    if entity_filter in {None, "", "fuid"}:
        fuid_query = db.query(InventoryFuid).filter(InventoryFuid.ps930IdArchive.in_(requested_archive_ids))
        if term:
            fuid_query = fuid_query.filter(or_(_matches_text(InventoryFuid.fuid_code, term), _matches_text(InventoryFuid.location_summary, term)))
        results.extend(
            _result("fuid", item.idFuid, item.fuid_code, item.support_type, "generated", item.ps930IdArchive, f"/fuid?fuid={item.idFuid}")
            for item in fuid_query.order_by(InventoryFuid.created_at.desc()).limit(100).all()
        )

    if entity_filter in {None, "", "kardex", "transfer"}:
        movement_query = db.query(KardexMovement).filter(
            or_(
                KardexMovement.ps930OriginArchiveId.in_(requested_archive_ids),
                KardexMovement.ps930DestinationArchiveId.in_(requested_archive_ids),
            )
        )
        if term:
            movement_query = movement_query.filter(or_(_matches_text(KardexMovement.movement_type, term), _matches_text(KardexMovement.entity_type, term), _matches_text(KardexMovement.observations, term)))
        if payload.status:
            movement_query = movement_query.filter(KardexMovement.status == payload.status)
        results.extend(
            _result("kardex", item.idMovement, item.movement_type, f"{item.entity_type} #{item.entity_id}", item.status, item.ps930DestinationArchiveId or item.ps930OriginArchiveId, f"/kardex?movement={item.idMovement}")
            for item in movement_query.order_by(KardexMovement.created_at.desc()).limit(100).all()
        )

    if entity_filter in {None, "", "employee"}:
        employee_query = db.query(Employee).filter(Employee.company_id == user.company_id)
        if term:
            employee_query = employee_query.filter(or_(_matches_text(Employee.identification, term), _matches_text(Employee.employee_code, term), _matches_text(Employee.full_name, term), _matches_text(Employee.position, term), _matches_text(Employee.department, term)))
        if payload.status:
            employee_query = employee_query.filter(Employee.status == payload.status)
        results.extend(
            _result("employee", item.identification, item.full_name, item.employee_code, item.status, None, f"/hr?employee={item.identification}")
            for item in employee_query.order_by(Employee.full_name.asc()).limit(100).all()
        )

    total = len(results)
    start = (payload.page - 1) * payload.size
    return {"engine": "mysql_fallback", "total": total, "items": results[start:start + payload.size]}


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
