from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import require_permission, user_permissions
from app.db.models import Archive, Document, DocumentMetadata, DocumentType, Employee, Expedient, Folder, HRCandidate, HRDepartment, HRPosition, InventoryFuid, KardexMovement, PhysicalBox, TrdSeries, TrdSubseries, User
from app.db.session import get_db
from app.domains.archives.router import _physical_location_path, allowed_archive_ids
from app.services.audit import write_audit
from app.services.search import index_document, search_documents

router = APIRouter(prefix="/search", tags=["search"])


class SearchRequest(BaseModel):
    q: str = ""
    entity_type: str | None = None
    archive_id: int | None = None
    document_type: str | None = None
    metadata_key: str | None = None
    metadata_value: str | None = None
    status: str | None = None
    location_id: int | None = None
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


def _doc_payload(document: Document, db: Session | None = None) -> dict:
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
        "location_path": _physical_location_path(db, "document", document.idDocument) if db else document.physical_location,
        "version": document.version,
        "owner": document.ps405Identification,
        "created_at": document.created_at,
    }


def _result(entity_type: str, entity_id: int | str, title: str, subtitle: str | None, status: str | None, archive_id: int | None, url: str, location_path: str | None = None) -> dict:
    return {
        "entity_type": entity_type,
        "id": entity_id,
        "title": title,
        "subtitle": subtitle,
        "status": status,
        "archive_id": archive_id,
        "url": url,
        "location_path": location_path,
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
        metadata_document_ids = db.query(DocumentMetadata.ps520IdDocument).filter(or_(_matches_text(DocumentMetadata.metadata_key, term), _matches_text(DocumentMetadata.metadata_value, term)))
        query = query.filter(or_(_matches_text(Document.document_name, term), _matches_text(Document.document_type, term), Document.idDocument.in_(metadata_document_ids)))
    if payload.document_type:
        query = query.filter(Document.document_type == payload.document_type)
    if payload.metadata_key or payload.metadata_value:
        metadata_query = db.query(DocumentMetadata.ps520IdDocument)
        if payload.metadata_key:
            metadata_query = metadata_query.filter(DocumentMetadata.metadata_key == payload.metadata_key)
        if payload.metadata_value:
            metadata_query = metadata_query.filter(_matches_text(DocumentMetadata.metadata_value, payload.metadata_value))
        query = query.filter(Document.idDocument.in_(metadata_query))
    if payload.status:
        query = query.filter(Document.status == payload.status)
    if payload.location_id:
        query = query.filter(Document.location_id == payload.location_id)
    if entity_filter in {None, "", "document"}:
        results.extend(_doc_payload(item, db) for item in query.order_by(Document.created_at.desc()).limit(200).all())

    if entity_filter in {None, "", "document_type", "tipologia"}:
        type_query = db.query(DocumentType).filter(DocumentType.status == "active")
        if term:
            type_query = type_query.filter(or_(_matches_text(DocumentType.type_code, term), _matches_text(DocumentType.name, term), _matches_text(DocumentType.sector, term), _matches_text(DocumentType.description, term)))
        if payload.document_type:
            type_query = type_query.filter(DocumentType.type_code == payload.document_type)
        results.extend(
            _result("document_type", item.idDocumentType, item.name, f"{item.type_code} / {item.sector or 'general'}", item.status, None, f"/trd?view=subseries&type={item.type_code}")
            for item in type_query.order_by(DocumentType.name.asc()).limit(100).all()
        )

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

    if entity_filter in {None, "", "series"}:
        series_query = db.query(TrdSeries)
        if term:
            series_query = series_query.filter(or_(_matches_text(TrdSeries.code, term), _matches_text(TrdSeries.name, term)))
        results.extend(
            _result("series", item.idSeries, item.name, item.code, "active", None, f"/trd?view=series&series={item.idSeries}")
            for item in series_query.order_by(TrdSeries.code.asc()).limit(100).all()
        )

    if entity_filter in {None, "", "subseries"}:
        subseries_query = db.query(TrdSubseries)
        if term:
            subseries_query = subseries_query.filter(_matches_text(TrdSubseries.name, term))
        results.extend(
            _result("subseries", item.idSubseries, item.name, f"Serie {item.ps610IdSeries}", "active", None, f"/trd?view=subseries&subseries={item.idSubseries}")
            for item in subseries_query.order_by(TrdSubseries.name.asc()).limit(100).all()
        )

    if entity_filter in {None, "", "expedient"}:
        expedient_query = db.query(Expedient).filter(Expedient.ps930IdArchive.in_(requested_archive_ids))
        if term:
            expedient_query = expedient_query.filter(or_(_matches_text(Expedient.expedient_code, term), _matches_text(Expedient.expedient_name, term), _matches_text(Expedient.expedient_type, term)))
        if payload.status:
            expedient_query = expedient_query.filter(Expedient.status == payload.status)
        results.extend(
            _result("expedient", item.idExpedient, item.expedient_name, item.expedient_code, item.status, item.ps930IdArchive, f"/expedients?expedient={item.idExpedient}", _physical_location_path(db, "expedient", item.idExpedient))
            for item in expedient_query.order_by(Expedient.created_at.desc()).limit(100).all()
        )

    if entity_filter in {None, "", "folder"}:
        folder_query = db.query(Folder).filter(Folder.ps930IdArchive.in_(requested_archive_ids))
        if term:
            folder_query = folder_query.filter(or_(_matches_text(Folder.folder_code, term), _matches_text(Folder.folder_name, term)))
        if payload.status:
            folder_query = folder_query.filter(Folder.status == payload.status)
        results.extend(
            _result("folder", item.idFolder, item.folder_name, item.folder_code, item.status, item.ps930IdArchive, f"/folders?folder={item.idFolder}", _physical_location_path(db, "folder", item.idFolder))
            for item in folder_query.order_by(Folder.created_at.desc()).limit(100).all()
        )

    if entity_filter in {None, "", "box"}:
        box_query = db.query(PhysicalBox).filter(PhysicalBox.ps930IdArchive.in_(requested_archive_ids))
        if term:
            box_query = box_query.filter(or_(_matches_text(PhysicalBox.box_code, term), _matches_text(PhysicalBox.box_name, term)))
        if payload.status:
            box_query = box_query.filter(PhysicalBox.status == payload.status)
        results.extend(
            _result("box", item.idBox, item.box_name or item.box_code, item.box_code, item.status, item.ps930IdArchive, f"/boxes?box={item.idBox}", _physical_location_path(db, "box", item.idBox))
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

    if entity_filter in {None, "", "user"}:
        user_query = db.query(User).filter(User.company_id == user.company_id)
        if term:
            user_query = user_query.filter(or_(_matches_text(User.identification, term), _matches_text(User.name, term), _matches_text(User.email, term)))
        if payload.status:
            user_query = user_query.filter(User.status == payload.status)
        results.extend(
            _result("user", item.identification, item.name, item.email, item.status, None, f"/users?user={item.identification}")
            for item in user_query.order_by(User.name.asc()).limit(100).all()
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

    if entity_filter in {None, "", "position"}:
        position_query = db.query(HRPosition)
        if term:
            position_query = position_query.filter(or_(_matches_text(HRPosition.position_code, term), _matches_text(HRPosition.name, term), _matches_text(HRPosition.level, term), _matches_text(HRPosition.department, term)))
        if payload.status:
            position_query = position_query.filter(HRPosition.status == payload.status)
        results.extend(
            _result("position", item.idPosition, item.name, f"{item.position_code} / {item.department}", item.status, None, f"/hr?view=positions&position={item.idPosition}")
            for item in position_query.order_by(HRPosition.name.asc()).limit(100).all()
        )

    if entity_filter in {None, "", "department"}:
        department_query = db.query(HRDepartment)
        if term:
            department_query = department_query.filter(or_(_matches_text(HRDepartment.department_code, term), _matches_text(HRDepartment.name, term)))
        if payload.status:
            department_query = department_query.filter(HRDepartment.status == payload.status)
        results.extend(
            _result("department", item.idDepartment, item.name, item.department_code, item.status, None, f"/hr?view=departments&department={item.idDepartment}")
            for item in department_query.order_by(HRDepartment.name.asc()).limit(100).all()
        )

    if entity_filter in {None, "", "candidate"}:
        candidate_query = db.query(HRCandidate)
        if term:
            candidate_query = candidate_query.filter(or_(_matches_text(HRCandidate.candidate_code, term), _matches_text(HRCandidate.full_name, term), _matches_text(HRCandidate.email, term), _matches_text(HRCandidate.position_applied, term), _matches_text(HRCandidate.department, term)))
        if payload.status:
            candidate_query = candidate_query.filter(HRCandidate.status == payload.status)
        results.extend(
            _result("candidate", item.idCandidate, item.full_name, f"{item.candidate_code} / {item.position_applied}", item.status, None, f"/hr?view=candidates&candidate={item.idCandidate}")
            for item in candidate_query.order_by(HRCandidate.created_at.desc()).limit(100).all()
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
        if index_document(_doc_payload(document, db)):
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
