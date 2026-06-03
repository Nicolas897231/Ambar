import csv
from io import BytesIO, StringIO
from zipfile import ZipFile
from xml.etree import ElementTree

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AuditLog, Document, DocumentType, Expedient, Folder, TrdDisposition, TrdSeries, TrdSubseries, User
from app.db.session import get_db
from app.services.audit import write_audit

router = APIRouter(prefix="/trd", tags=["trd"])


class SeriesCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=3, max_length=160)
    description: str | None = None


class SubseriesCreate(BaseModel):
    series_id: int
    name: str = Field(min_length=3, max_length=160)
    retention_years: int = Field(ge=1, le=100)


class DispositionCreate(BaseModel):
    subseries_id: int
    archive_management: int = Field(ge=0, le=100)
    archive_central: int = Field(ge=0, le=100)
    final_action: str = Field(min_length=3, max_length=120)


class RetentionUpdate(BaseModel):
    retention_years: int = Field(ge=1, le=100)


TRD_IMPORT_COLUMNS = {
    "dependencia": "dependencia",
    "dependency": "dependencia",
    "serie_codigo": "serie_codigo",
    "codigo_serie": "serie_codigo",
    "series_code": "serie_codigo",
    "serie": "serie_nombre",
    "serie_nombre": "serie_nombre",
    "series_name": "serie_nombre",
    "subserie": "subserie_nombre",
    "subserie_nombre": "subserie_nombre",
    "subseries_name": "subserie_nombre",
    "retencion": "retencion",
    "retention_years": "retencion",
    "disposicion": "disposicion",
    "disposicion_final": "disposicion",
    "final_action": "disposicion",
    "tipologias": "tipologias",
    "tipologias_documentales": "tipologias",
    "document_types": "tipologias",
}


def _series_out(series: TrdSeries) -> dict:
    return {"idSeries": series.idSeries, "code": series.code, "name": series.name, "description": series.description}


def _subseries_out(subseries: TrdSubseries) -> dict:
    return {
        "idSubseries": subseries.idSubseries,
        "ps610IdSeries": subseries.ps610IdSeries,
        "name": subseries.name,
        "retention_years": subseries.retention_years,
    }


def _document_out(document: Document) -> dict:
    return {
        "idDocument": document.idDocument,
        "document_name": document.document_name,
        "document_type": document.document_type,
        "status": document.status,
        "version": document.version,
        "archive_id": document.ps930IdArchive,
        "expedient_id": document.ps950IdExpedient,
        "folder_id": document.ps952IdFolder,
        "folio_start": document.folio_start,
        "folio_end": document.folio_end,
        "folio_total": document.folio_total,
    }


def _expedient_out(expedient: Expedient) -> dict:
    return {
        "idExpedient": expedient.idExpedient,
        "expedient_code": expedient.expedient_code,
        "expedient_name": expedient.expedient_name,
        "status": expedient.status,
        "archive_id": expedient.ps930IdArchive,
        "series_id": expedient.ps610IdSeries,
        "subseries_id": expedient.ps612IdSubseries,
        "document_count": expedient.document_count,
        "folio_count": expedient.folio_count,
    }


def _disposition_out(disposition: TrdDisposition) -> dict:
    return {
        "idDisposition": disposition.idDisposition,
        "subseries_id": disposition.ps612IdSubseries,
        "archive_management": disposition.archive_management,
        "archive_central": disposition.archive_central,
        "final_action": disposition.final_action,
    }


def _audit_out(audit: AuditLog) -> dict:
    return {
        "idAudit": audit.idAudit,
        "action": audit.action,
        "module": audit.module,
        "entity": audit.entity,
        "entity_id": audit.entity_id,
        "result": audit.result,
        "severity": audit.severity,
        "created_at": audit.created_at,
    }


def _normalize_header(value: str | None) -> str:
    return (value or "").strip().lower().replace(" ", "_").replace("-", "_")


def _normalize_type_code(value: str) -> str:
    normalized = value.strip().lower()
    replacements = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n"}
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)
    return "".join(char if char.isalnum() else "_" for char in normalized).strip("_")


def _split_types(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for chunk in value.split("|") for item in chunk.split(";") if item.strip()]


def _parse_csv_rows(content: bytes) -> list[dict]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(StringIO(text))
    rows = []
    for row in reader:
        normalized = {}
        for key, value in row.items():
            mapped = TRD_IMPORT_COLUMNS.get(_normalize_header(key))
            if mapped:
                normalized[mapped] = (value or "").strip()
        if any(normalized.values()):
            rows.append(normalized)
    return rows


def _column_index(cell_ref: str) -> int:
    letters = "".join(char for char in cell_ref if char.isalpha())
    index = 0
    for char in letters:
        index = index * 26 + (ord(char.upper()) - ord("A") + 1)
    return max(index - 1, 0)


def _parse_xlsx_rows(content: bytes) -> list[dict]:
    namespace = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with ZipFile(BytesIO(content)) as workbook:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall(".//main:si", namespace):
                shared_strings.append("".join(text.text or "" for text in item.findall(".//main:t", namespace)))
        sheet_name = "xl/worksheets/sheet1.xml"
        if sheet_name not in workbook.namelist():
            raise HTTPException(status_code=422, detail="El XLSX debe tener datos en la primera hoja.")
        sheet = ElementTree.fromstring(workbook.read(sheet_name))
        table: list[list[str]] = []
        for row in sheet.findall(".//main:row", namespace):
            values: dict[int, str] = {}
            for cell in row.findall("main:c", namespace):
                ref = cell.attrib.get("r", "A1")
                value = cell.find("main:v", namespace)
                raw = value.text if value is not None else ""
                if cell.attrib.get("t") == "s" and raw:
                    raw = shared_strings[int(raw)] if int(raw) < len(shared_strings) else raw
                values[_column_index(ref)] = raw or ""
            if values:
                table.append([values.get(index, "") for index in range(max(values) + 1)])
        if not table:
            return []
        headers = [TRD_IMPORT_COLUMNS.get(_normalize_header(value), "") for value in table[0]]
        rows = []
        for line in table[1:]:
            normalized = {headers[index]: value.strip() for index, value in enumerate(line) if index < len(headers) and headers[index]}
            if any(normalized.values()):
                rows.append(normalized)
        return rows


def _parse_import_rows(filename: str, content: bytes) -> list[dict]:
    lowered = filename.lower()
    if lowered.endswith(".csv"):
        return _parse_csv_rows(content)
    if lowered.endswith(".xlsx"):
        return _parse_xlsx_rows(content)
    raise HTTPException(status_code=415, detail="Carga un archivo CSV o XLSX.")


def _trd_import_impact(db: Session, rows: list[dict]) -> dict:
    existing_series = {item.code for item in db.query(TrdSeries).all()}
    existing_subseries = {(item.ps610IdSeries, item.name.lower()) for item in db.query(TrdSubseries).all()}
    series_by_code = {item.code: item for item in db.query(TrdSeries).all()}
    existing_types = {item.type_code for item in db.query(DocumentType).all()}
    new_series: set[str] = set()
    new_subseries: set[str] = set()
    new_types: set[str] = set()
    invalid_rows: list[dict] = []
    for index, row in enumerate(rows, start=2):
        code = row.get("serie_codigo")
        series_name = row.get("serie_nombre")
        subseries_name = row.get("subserie_nombre")
        if not code or not series_name or not subseries_name:
            invalid_rows.append({"row": index, "reason": "Faltan serie_codigo, serie_nombre o subserie."})
            continue
        if code not in existing_series:
            new_series.add(f"{code} - {series_name}")
        series_id = series_by_code.get(code).idSeries if code in series_by_code else None
        if series_id is None or (series_id, subseries_name.lower()) not in existing_subseries:
            new_subseries.add(f"{code} / {subseries_name}")
        for type_name in _split_types(row.get("tipologias")):
            type_code = _normalize_type_code(type_name)
            if type_code and type_code not in existing_types:
                new_types.add(type_name)
    return {
        "rows": len(rows),
        "series_new": sorted(new_series),
        "subseries_new": sorted(new_subseries),
        "document_types_new": sorted(new_types),
        "invalid_rows": invalid_rows,
        "can_import": not invalid_rows,
    }


def _apply_trd_rows(db: Session, rows: list[dict]) -> dict:
    created = {"series": 0, "subseries": 0, "document_types": 0, "dispositions": 0}
    for row in rows:
        code = row.get("serie_codigo")
        series_name = row.get("serie_nombre")
        subseries_name = row.get("subserie_nombre")
        if not code or not series_name or not subseries_name:
            continue
        series = db.query(TrdSeries).filter(TrdSeries.code == code).one_or_none()
        if not series:
            series = TrdSeries(code=code, name=series_name, description=row.get("dependencia"))
            db.add(series)
            db.flush()
            created["series"] += 1
        retention = int(row.get("retencion") or 5)
        subseries = db.query(TrdSubseries).filter(TrdSubseries.ps610IdSeries == series.idSeries, TrdSubseries.name == subseries_name).one_or_none()
        if not subseries:
            subseries = TrdSubseries(ps610IdSeries=series.idSeries, name=subseries_name, retention_years=retention)
            db.add(subseries)
            db.flush()
            created["subseries"] += 1
        elif subseries.retention_years != retention:
            subseries.retention_years = retention
        disposition_text = row.get("disposicion")
        if disposition_text and not db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries.idSubseries, TrdDisposition.final_action == disposition_text).first():
            db.add(TrdDisposition(ps612IdSubseries=subseries.idSubseries, archive_management=0, archive_central=retention, final_action=disposition_text))
            created["dispositions"] += 1
        for type_name in _split_types(row.get("tipologias")):
            type_code = _normalize_type_code(type_name)
            if not type_code:
                continue
            document_type = db.query(DocumentType).filter(DocumentType.type_code == type_code).one_or_none()
            if document_type:
                document_type.ps610IdSeries = series.idSeries
                document_type.ps612IdSubseries = subseries.idSubseries
            else:
                db.add(DocumentType(type_code=type_code, name=type_name, ps610IdSeries=series.idSeries, ps612IdSubseries=subseries.idSubseries, required_metadata={"items": []}, optional_metadata={"items": []}, validation_schema={"required": [], "optional": []}, status="active"))
                created["document_types"] += 1
    return created


def _csv_escape(value: object) -> str:
    text = "" if value is None else str(value)
    if any(char in text for char in [",", "\"", "\n"]):
        escaped = text.replace('"', '""')
        return f'"{escaped}"'
    return text


def _xlsx_from_csv_lines(lines: list[str]) -> bytes:
    rows = [line.split(",") for line in lines]
    sheet_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for col_index, value in enumerate(row, start=1):
            col = chr(64 + col_index)
            cells.append(f'<c r="{col}{row_index}" t="inlineStr"><is><t>{str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")}</t></is></c>')
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    sheet = f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'
    output = BytesIO()
    with ZipFile(output, "w") as xlsx:
        xlsx.writestr("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        xlsx.writestr("_rels/.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        xlsx.writestr("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="TRD" sheetId="1" r:id="rId1"/></sheets></workbook>')
        xlsx.writestr("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        xlsx.writestr("xl/worksheets/sheet1.xml", sheet)
    return output.getvalue()



@router.get("/series")
def list_series(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))):
    return db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()


@router.post("/import/simulate")
async def simulate_trd_import(file: UploadFile = File(...), _: User = Depends(require_permission("trd.manage")), db: Session = Depends(get_db)) -> dict:
    rows = _parse_import_rows(file.filename or "", await file.read())
    return _trd_import_impact(db, rows)


@router.post("/import/apply")
async def apply_trd_import(request: Request, file: UploadFile = File(...), user: User = Depends(require_permission("trd.manage")), db: Session = Depends(get_db)) -> dict:
    rows = _parse_import_rows(file.filename or "", await file.read())
    impact = _trd_import_impact(db, rows)
    if impact["invalid_rows"]:
        raise HTTPException(status_code=422, detail={"message": "La TRD tiene filas invalidas.", "invalid_rows": impact["invalid_rows"]})
    created = _apply_trd_rows(db, rows)
    write_audit(db, action="trd_imported", module="trd", user_id=user.identification, entity="trd", entity_id=file.filename, new_values=created | {"rows": len(rows)}, request=request)
    db.commit()
    return {"imported": True, "rows": len(rows), "created": created}


@router.get("/export")
def export_trd(request: Request, format: str = "csv", user: User = Depends(require_permission("document.read")), db: Session = Depends(get_db)) -> Response:
    lines = ["dependencia,serie_codigo,serie_nombre,subserie_nombre,retencion,disposicion,tipologias"]
    series_rows = db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()
    for series in series_rows:
        subseries_rows = db.query(TrdSubseries).filter(TrdSubseries.ps610IdSeries == series.idSeries).order_by(TrdSubseries.name.asc()).all()
        for subseries in subseries_rows:
            disposition = db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries.idSubseries).order_by(TrdDisposition.idDisposition.desc()).first()
            types = db.query(DocumentType).filter(DocumentType.ps612IdSubseries == subseries.idSubseries).order_by(DocumentType.name.asc()).all()
            lines.append(",".join([
                _csv_escape(series.description or ""),
                _csv_escape(series.code),
                _csv_escape(series.name),
                _csv_escape(subseries.name),
                _csv_escape(subseries.retention_years),
                _csv_escape(disposition.final_action if disposition else ""),
                _csv_escape("; ".join(item.name for item in types)),
            ]))
    write_audit(db, action="trd_exported", module="trd", user_id=user.identification, entity="trd", entity_id=format, new_values={"format": format, "rows": len(lines) - 1}, request=request)
    db.commit()
    if format == "xlsx":
        return Response(_xlsx_from_csv_lines(lines), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=ambar_trd.xlsx"})
    return Response("\n".join(lines), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": "attachment; filename=ambar_trd.csv"})


@router.get("/series/tree")
def series_tree(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> list[dict]:
    series_rows = db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()
    subseries_rows = db.query(TrdSubseries).order_by(TrdSubseries.name.asc()).all()
    by_series: dict[int, list[TrdSubseries]] = {}
    for subseries in subseries_rows:
        by_series.setdefault(subseries.ps610IdSeries, []).append(subseries)
    return [
        {
            "idSeries": series.idSeries,
            "code": series.code,
            "name": series.name,
            "description": series.description,
            "subseries": [
                {
                    "idSubseries": subseries.idSubseries,
                    "name": subseries.name,
                    "retention_years": subseries.retention_years,
                    "active_expedients": db.query(Expedient).filter(Expedient.ps612IdSubseries == subseries.idSubseries, Expedient.status == "active").count(),
                    "documents": db.query(Document).filter(Document.ps612IdSubseries == subseries.idSubseries).count(),
                }
                for subseries in by_series.get(series.idSeries, [])
            ],
        }
        for series in series_rows
    ]


@router.get("/series/{series_id}/workspace")
def series_workspace(series_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> dict:
    series = db.get(TrdSeries, series_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    subseries = db.query(TrdSubseries).filter(TrdSubseries.ps610IdSeries == series_id).order_by(TrdSubseries.name.asc()).all()
    subseries_ids = [item.idSubseries for item in subseries]
    return {
        "series": _series_out(series),
        "subseries": [_subseries_out(item) for item in subseries],
        "kpis": {
            "total_expedients": db.query(Expedient).filter(Expedient.ps610IdSeries == series_id).count(),
            "active_expedients": db.query(Expedient).filter(Expedient.ps610IdSeries == series_id, Expedient.status == "active").count(),
            "closed_expedients": db.query(Expedient).filter(Expedient.ps610IdSeries == series_id, Expedient.status == "closed").count(),
            "total_documents": db.query(Document).filter(Document.ps612IdSubseries.in_(subseries_ids)).count() if subseries_ids else 0,
            "total_folders": db.query(Folder).join(Expedient, Expedient.idExpedient == Folder.ps950IdExpedient).filter(Expedient.ps610IdSeries == series_id).count(),
        },
        "dispositions": [
            _disposition_out(item)
            for item in (db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries.in_(subseries_ids)).all() if subseries_ids else [])
        ],
    }


@router.post("/series", status_code=status.HTTP_201_CREATED)
def create_series(
    payload: SeriesCreate,
    request: Request,
    user: User = Depends(require_permission("trd.manage")),
    db: Session = Depends(get_db),
):
    if db.query(TrdSeries).filter(TrdSeries.code == payload.code).first():
        raise HTTPException(status_code=409, detail="Series code already exists")
    item = TrdSeries(**payload.model_dump())
    db.add(item)
    db.flush()
    write_audit(db, action="trd_series_created", module="trd", user_id=user.identification, entity="series", entity_id=item.idSeries, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/subseries")
def list_subseries(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))):
    return db.query(TrdSubseries).order_by(TrdSubseries.name.asc()).all()


@router.get("/subseries/{subseries_id}/workspace")
def subseries_workspace(subseries_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> dict:
    subseries = db.get(TrdSubseries, subseries_id)
    if not subseries:
        raise HTTPException(status_code=404, detail="Subseries not found")
    expedients = db.query(Expedient).filter(Expedient.ps612IdSubseries == subseries_id).order_by(Expedient.created_at.desc()).limit(100).all()
    documents = db.query(Document).filter(Document.ps612IdSubseries == subseries_id).order_by(Document.created_at.desc()).limit(100).all()
    disposition = db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries_id).order_by(TrdDisposition.idDisposition.desc()).first()
    audit = db.query(AuditLog).filter(AuditLog.module == "trd", AuditLog.entity_id == str(subseries_id)).order_by(AuditLog.created_at.desc()).limit(20).all()
    document_types = db.query(DocumentType).filter(DocumentType.ps612IdSubseries == subseries_id).order_by(DocumentType.name.asc()).all()
    return {
        "subseries": _subseries_out(subseries),
        "series": _series_out(subseries.series),
        "document_types": [
            {
                "idDocumentType": item.idDocumentType,
                "type_code": item.type_code,
                "name": item.name,
                "sector": item.sector,
                "required_metadata": (item.required_metadata or {}).get("items") or [],
                "optional_metadata": (item.optional_metadata or {}).get("items") or [],
            }
            for item in document_types
        ],
        "expedients": [_expedient_out(item) for item in expedients],
        "documents": [_document_out(item) for item in documents],
        "retention": {
            "management_years": disposition.archive_management if disposition else 0,
            "central_years": disposition.archive_central if disposition else subseries.retention_years,
            "total_years": subseries.retention_years,
            "final_action": disposition.final_action if disposition else "Pendiente",
        },
        "audit": [_audit_out(item) for item in audit],
    }


@router.get("/subseries/{subseries_id}/retention-timeline")
def retention_timeline(subseries_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> dict:
    subseries = db.get(TrdSubseries, subseries_id)
    if not subseries:
        raise HTTPException(status_code=404, detail="Subseries not found")
    disposition = db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries_id).order_by(TrdDisposition.idDisposition.desc()).first()
    management = disposition.archive_management if disposition else 0
    central = disposition.archive_central if disposition else subseries.retention_years
    return {
        "subseries_id": subseries_id,
        "steps": [
            {"stage": "Gestion", "years": management, "description": "Retencion en archivo de gestion"},
            {"stage": "Central", "years": central, "description": "Retencion en archivo central"},
            {"stage": "Historico", "years": None, "description": disposition.final_action if disposition else "Disposicion final pendiente"},
        ],
    }


@router.post("/subseries", status_code=status.HTTP_201_CREATED)
def create_subseries(
    payload: SubseriesCreate,
    request: Request,
    user: User = Depends(require_permission("trd.manage")),
    db: Session = Depends(get_db),
):
    if not db.get(TrdSeries, payload.series_id):
        raise HTTPException(status_code=404, detail="Series not found")
    item = TrdSubseries(ps610IdSeries=payload.series_id, name=payload.name, retention_years=payload.retention_years)
    db.add(item)
    db.flush()
    write_audit(db, action="trd_subseries_created", module="trd", user_id=user.identification, entity="subseries", entity_id=item.idSubseries, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/subseries/{subseries_id}/retention")
def update_retention(
    subseries_id: int,
    payload: RetentionUpdate,
    request: Request,
    user: User = Depends(require_permission("trd.manage")),
    db: Session = Depends(get_db),
):
    item = db.get(TrdSubseries, subseries_id)
    if not item:
        raise HTTPException(status_code=404, detail="Subseries not found")
    old_values = {"retention_years": item.retention_years}
    item.retention_years = payload.retention_years
    write_audit(db, action="trd_retention_updated", module="trd", user_id=user.identification, entity="subseries", entity_id=item.idSubseries, old_values=old_values, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/dispositions")
def list_dispositions(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))):
    return db.query(TrdDisposition).order_by(TrdDisposition.idDisposition.desc()).all()


@router.post("/dispositions", status_code=status.HTTP_201_CREATED)
def create_disposition(
    payload: DispositionCreate,
    request: Request,
    user: User = Depends(require_permission("trd.manage")),
    db: Session = Depends(get_db),
):
    if not db.get(TrdSubseries, payload.subseries_id):
        raise HTTPException(status_code=404, detail="Subseries not found")
    item = TrdDisposition(
        ps612IdSubseries=payload.subseries_id,
        archive_management=payload.archive_management,
        archive_central=payload.archive_central,
        final_action=payload.final_action,
    )
    db.add(item)
    db.flush()
    write_audit(db, action="trd_disposition_created", module="trd", user_id=user.identification, entity="disposition", entity_id=item.idDisposition, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item
