import csv
from datetime import UTC, datetime
from io import BytesIO, StringIO
from zipfile import ZipFile
from xml.etree import ElementTree

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AuditLog, Document, DocumentType, Expedient, Folder, TrdDependency, TrdDisposition, TrdSeries, TrdSubseries, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.codes import supplied_or_generated

router = APIRouter(prefix="/trd", tags=["trd"])


def _blank_to_none(value):
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    return value


class SeriesCreate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=40)
    name: str = Field(min_length=3, max_length=160)
    description: str | None = None
    dependency_id: int | None = None
    status: str = Field(default="active", pattern="^(active|inactive)$")

    @field_validator("code", mode="before")
    @classmethod
    def blank_code_to_none(cls, value):
        return _blank_to_none(value)


class DependencyCreate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=40)
    name: str = Field(min_length=3, max_length=160)
    description: str | None = None
    status: str = Field(default="active", pattern="^(active|inactive)$")

    @field_validator("code", mode="before")
    @classmethod
    def blank_code_to_none(cls, value):
        return _blank_to_none(value)


class SubseriesCreate(BaseModel):
    series_id: int
    name: str = Field(min_length=3, max_length=160)
    retention_years: int = Field(ge=1, le=100)


class DispositionCreate(BaseModel):
    subseries_id: int
    archive_management: int = Field(ge=0, le=100)
    archive_central: int = Field(ge=0, le=100)
    final_action: str = Field(min_length=1, max_length=120)
    procedure: str | None = None


class RetentionUpdate(BaseModel):
    retention_years: int | None = Field(default=None, ge=1, le=100)
    archive_management: int | None = Field(default=None, ge=0, le=100)
    archive_central: int | None = Field(default=None, ge=0, le=100)
    final_action: str | None = Field(default=None, min_length=1, max_length=120)
    procedure: str | None = None


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
    "retencion_total": "retencion",
    "retencion_gestion": "retencion_gestion",
    "retención_gestión": "retencion_gestion",
    "archivo_gestion": "retencion_gestion",
    "retention_management": "retencion_gestion",
    "retencion_central": "retencion_central",
    "retención_central": "retencion_central",
    "archivo_central": "retencion_central",
    "retention_central": "retencion_central",
    "disposicion": "disposicion",
    "disposicion_final": "disposicion",
    "final_action": "disposicion",
    "procedimiento": "procedimiento",
    "procedure": "procedimiento",
    "tipologias": "tipologias",
    "tipologias_documentales": "tipologias",
    "tipo_documental": "tipologias",
    "tipo_documental_trd": "tipologias",
    "document_types": "tipologias",
}

FINAL_ACTIONS = {
    "ct": "CT",
    "conservacion_total": "CT",
    "conservación_total": "CT",
    "conservacion total": "CT",
    "conservación total": "CT",
    "e": "E",
    "eliminacion": "E",
    "eliminación": "E",
    "s": "S",
    "seleccion": "S",
    "selección": "S",
    "mt": "MT",
    "medio_tecnologico": "MT",
    "medio tecnológico": "MT",
    "medio tecnologico": "MT",
    "microfilmacion": "MT",
    "microfilmación": "MT",
    "digitalizacion": "MT",
    "digitalización": "MT",
}


def _series_out(series: TrdSeries) -> dict:
    return {
        "idSeries": series.idSeries,
        "dependency_id": series.ps608IdDependency,
        "dependency": _dependency_out(series.dependency) if series.dependency else None,
        "code": series.code,
        "name": series.name,
        "description": series.description,
        "status": series.status,
    }


def _subseries_out(subseries: TrdSubseries) -> dict:
    return {
        "idSubseries": subseries.idSubseries,
        "ps610IdSeries": subseries.ps610IdSeries,
        "name": subseries.name,
        "retention_years": subseries.retention_years,
        "status": subseries.status,
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
        "procedure": disposition.procedure,
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


def _normalize_dependency_code(value: str) -> str:
    base = _normalize_type_code(value or "general").upper().replace("_", "-")
    return base[:40] or "GENERAL"


def _normalize_final_action(value: str | None) -> str:
    if not value:
        raise HTTPException(status_code=422, detail="La disposicion final es obligatoria.")
    key = value.strip().lower().replace("-", "_")
    compact = key.replace("_", " ")
    if key in FINAL_ACTIONS:
        return FINAL_ACTIONS[key]
    if compact in FINAL_ACTIONS:
        return FINAL_ACTIONS[compact]
    raise HTTPException(status_code=422, detail="Disposicion final invalida. Usa CT, E, S o MT.")


def _parse_year(value: str | int | None, default: int | None = None) -> int:
    if value in {None, ""}:
        if default is None:
            raise HTTPException(status_code=422, detail="La retencion documental es obligatoria.")
        return default
    try:
        year = int(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Retencion invalida: {value}") from exc
    if year < 0 or year > 100:
        raise HTTPException(status_code=422, detail="La retencion debe estar entre 0 y 100 anos.")
    return year


def _default_dependency(db: Session) -> TrdDependency:
    dependency = db.query(TrdDependency).filter(TrdDependency.code == "GENERAL").one_or_none()
    if dependency:
        return dependency
    dependency = TrdDependency(code="GENERAL", name="General", description="Dependencia general para datos existentes o compatibilidad.", status="active")
    db.add(dependency)
    db.flush()
    return dependency


def _dependency_out(dependency: TrdDependency) -> dict:
    return {
        "idDependency": dependency.idDependency,
        "code": dependency.code,
        "name": dependency.name,
        "description": dependency.description,
        "status": dependency.status,
    }


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
    existing_dependencies = {item.code for item in db.query(TrdDependency).all()}
    existing_series = {item.code for item in db.query(TrdSeries).all()}
    existing_subseries = {(item.ps610IdSeries, item.name.lower()) for item in db.query(TrdSubseries).all()}
    series_by_code = {item.code: item for item in db.query(TrdSeries).all()}
    existing_types = {item.type_code for item in db.query(DocumentType).all()}
    new_dependencies: set[str] = set()
    new_series: set[str] = set()
    new_subseries: set[str] = set()
    new_types: set[str] = set()
    invalid_rows: list[dict] = []
    for index, row in enumerate(rows, start=2):
        dependency_name = row.get("dependencia")
        code = row.get("serie_codigo")
        series_name = row.get("serie_nombre")
        subseries_name = row.get("subserie_nombre")
        management = row.get("retencion_gestion")
        central = row.get("retencion_central") or row.get("retencion")
        final_action = row.get("disposicion")
        if not code or not series_name or not subseries_name:
            invalid_rows.append({"row": index, "reason": "Faltan serie_codigo, serie_nombre o subserie."})
            continue
        if not dependency_name:
            invalid_rows.append({"row": index, "reason": "Falta dependencia."})
            continue
        if central in {None, ""}:
            invalid_rows.append({"row": index, "reason": "Falta retencion central o retencion total."})
            continue
        if management in {None, ""} and row.get("retencion") in {None, ""}:
            invalid_rows.append({"row": index, "reason": "Falta retencion gestion."})
            continue
        if not final_action:
            invalid_rows.append({"row": index, "reason": "Falta disposicion final."})
            continue
        try:
            _parse_year(management, default=0)
            _parse_year(central)
            _normalize_final_action(final_action)
        except HTTPException as exc:
            invalid_rows.append({"row": index, "reason": str(exc.detail)})
            continue
        dependency_code = _normalize_dependency_code(dependency_name)
        if dependency_code not in existing_dependencies:
            new_dependencies.add(f"{dependency_code} - {dependency_name}")
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
        "dependencies_new": sorted(new_dependencies),
        "series_new": sorted(new_series),
        "subseries_new": sorted(new_subseries),
        "document_types_new": sorted(new_types),
        "invalid_rows": invalid_rows,
        "can_import": not invalid_rows,
    }


def _apply_trd_rows(db: Session, rows: list[dict]) -> dict:
    created = {"dependencies": 0, "series": 0, "subseries": 0, "document_types": 0, "dispositions": 0}
    for row in rows:
        dependency_name = row.get("dependencia")
        code = row.get("serie_codigo")
        series_name = row.get("serie_nombre")
        subseries_name = row.get("subserie_nombre")
        if not dependency_name or not code or not series_name or not subseries_name:
            continue
        dependency_code = _normalize_dependency_code(dependency_name)
        dependency = db.query(TrdDependency).filter(TrdDependency.code == dependency_code).one_or_none()
        if not dependency:
            dependency = TrdDependency(code=dependency_code, name=dependency_name, status="active")
            db.add(dependency)
            db.flush()
            created["dependencies"] += 1
        series = db.query(TrdSeries).filter(TrdSeries.code == code).one_or_none()
        if not series:
            series = TrdSeries(code=code, name=series_name, description=row.get("procedimiento"), ps608IdDependency=dependency.idDependency, status="active")
            db.add(series)
            db.flush()
            created["series"] += 1
        else:
            series.ps608IdDependency = dependency.idDependency
            series.name = series_name
        retention = int(row.get("retencion") or 5)
        management = _parse_year(row.get("retencion_gestion"), default=0)
        central = _parse_year(row.get("retencion_central") or row.get("retencion"), default=retention)
        final_action = _normalize_final_action(row.get("disposicion"))
        subseries = db.query(TrdSubseries).filter(TrdSubseries.ps610IdSeries == series.idSeries, TrdSubseries.name == subseries_name).one_or_none()
        if not subseries:
            subseries = TrdSubseries(ps610IdSeries=series.idSeries, name=subseries_name, retention_years=management + central, status="active")
            db.add(subseries)
            db.flush()
            created["subseries"] += 1
        elif subseries.retention_years != management + central:
            subseries.retention_years = management + central
        disposition = db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries.idSubseries).order_by(TrdDisposition.idDisposition.desc()).first()
        if disposition:
            disposition.archive_management = management
            disposition.archive_central = central
            disposition.final_action = final_action
            disposition.procedure = row.get("procedimiento")
        else:
            db.add(TrdDisposition(ps612IdSubseries=subseries.idSubseries, archive_management=management, archive_central=central, final_action=final_action, procedure=row.get("procedimiento")))
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
                db.add(DocumentType(type_code=type_code, name=type_name, ps610IdSeries=series.idSeries, ps612IdSubseries=subseries.idSubseries, required_metadata={"items": []}, optional_metadata={"items": []}, validation_schema={"required": [], "optional": []}, required_in_expedient=True, status="active"))
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


def _disposition_for_subseries(db: Session, subseries_id: int | None) -> TrdDisposition | None:
    if not subseries_id:
        return None
    return db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries_id).order_by(TrdDisposition.idDisposition.desc()).first()


def _add_years(value: datetime, years: int) -> datetime:
    try:
        return value.replace(year=value.year + years)
    except ValueError:
        return value.replace(month=2, day=28, year=value.year + years)


def _lifecycle_from_expedient(db: Session, expedient: Expedient) -> dict:
    disposition = _disposition_for_subseries(db, expedient.ps612IdSubseries)
    if not disposition:
        return {
            "status": "incomplete_trd",
            "current_stage": "TRD incompleta",
            "message": "La subserie no tiene retencion/disposicion configurada.",
            "timeline": [],
        }
    closure = (expedient.metadata_json or {}).get("closure") or {}
    closed_at_value = closure.get("closed_at")
    closed_at = None
    if closed_at_value:
        closed_at = datetime.fromisoformat(closed_at_value.replace("Z", "+00:00"))
    base_date = closed_at or expedient.created_at or datetime.now(UTC)
    management_until = _add_years(base_date, disposition.archive_management)
    central_until = _add_years(management_until, disposition.archive_central)
    now = datetime.now(UTC)
    if not closed_at:
        current_stage = "Archivo Gestion"
    elif now <= management_until:
        current_stage = "Archivo Gestion"
    elif now <= central_until:
        current_stage = "Archivo Central"
    else:
        current_stage = "Disposicion Final" if disposition.final_action != "CT" else "Archivo Historico"
    return {
        "status": "calculated",
        "current_stage": current_stage,
        "closed_at": closed_at,
        "management_until": management_until,
        "central_until": central_until,
        "final_action": disposition.final_action,
        "procedure": disposition.procedure,
        "timeline": [
            {"stage": "Archivo Gestion", "from": base_date, "until": management_until, "years": disposition.archive_management},
            {"stage": "Archivo Central", "from": management_until, "until": central_until, "years": disposition.archive_central},
            {"stage": "Disposicion Final", "from": central_until, "until": None, "action": disposition.final_action, "procedure": disposition.procedure},
        ],
    }


@router.get("/editor")
def trd_editor(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> dict:
    rows = []
    dependencies = {item.idDependency: item for item in db.query(TrdDependency).all()}
    series_rows = db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()
    for series in series_rows:
        subseries_rows = db.query(TrdSubseries).filter(TrdSubseries.ps610IdSeries == series.idSeries).order_by(TrdSubseries.name.asc()).all()
        for subseries in subseries_rows:
            disposition = _disposition_for_subseries(db, subseries.idSubseries)
            types = db.query(DocumentType).filter(DocumentType.ps612IdSubseries == subseries.idSubseries).order_by(DocumentType.name.asc()).all()
            rows.append({
                "dependency": _dependency_out(dependencies[series.ps608IdDependency]) if series.ps608IdDependency in dependencies else None,
                "series": _series_out(series),
                "subseries": _subseries_out(subseries),
                "document_types": [
                    {"idDocumentType": item.idDocumentType, "type_code": item.type_code, "name": item.name, "status": item.status, "required_in_expedient": item.required_in_expedient, "metadata_schema": item.validation_schema or {}}
                    for item in types
                ],
                "retention": {
                    "management_years": disposition.archive_management if disposition else None,
                    "central_years": disposition.archive_central if disposition else None,
                    "total_years": subseries.retention_years,
                    "final_action": disposition.final_action if disposition else None,
                    "procedure": disposition.procedure if disposition else None,
                    "complete": bool(disposition and disposition.final_action),
                },
                "usage": {
                    "expedients": db.query(Expedient).filter(Expedient.ps612IdSubseries == subseries.idSubseries).count(),
                    "documents": db.query(Document).filter(Document.ps612IdSubseries == subseries.idSubseries).count(),
                },
            })
    return {"rows": rows, "total": len(rows)}


@router.get("/series")
def list_series(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))):
    rows = db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()
    default_dependency = _default_dependency(db)
    changed = False
    for row in rows:
        if not row.ps608IdDependency:
            row.ps608IdDependency = default_dependency.idDependency
            changed = True
    if changed:
        db.commit()
    return [_series_out(item) for item in rows]


@router.get("/dependencies")
def list_dependencies(db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> list[dict]:
    rows = db.query(TrdDependency).order_by(TrdDependency.name.asc()).all()
    if not rows:
        rows = [_default_dependency(db)]
        db.commit()
    return [_dependency_out(item) for item in rows]


@router.post("/dependencies", status_code=status.HTTP_201_CREATED)
def create_dependency(payload: DependencyCreate, request: Request, user: User = Depends(require_permission("trd.manage")), db: Session = Depends(get_db)) -> dict:
    code = supplied_or_generated(db, payload.code, TrdDependency, "code", "DEP")
    if db.query(TrdDependency).filter(TrdDependency.code == code).first():
        raise HTTPException(status_code=409, detail="Dependency code already exists")
    item = TrdDependency(code=code, name=payload.name.strip(), description=payload.description, status=payload.status)
    db.add(item)
    db.flush()
    write_audit(db, action="trd_dependency_created", module="trd", user_id=user.identification, entity="dependency", entity_id=item.idDependency, new_values=payload.model_dump() | {"code": code}, request=request)
    db.commit()
    db.refresh(item)
    return _dependency_out(item)


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
    lines = ["Dependencia,Serie Codigo,Serie,Subserie,Tipo Documental,Retencion Gestion,Retencion Central,Disposicion Final,Procedimiento"]
    series_rows = db.query(TrdSeries).order_by(TrdSeries.code.asc()).all()
    for series in series_rows:
        subseries_rows = db.query(TrdSubseries).filter(TrdSubseries.ps610IdSeries == series.idSeries).order_by(TrdSubseries.name.asc()).all()
        for subseries in subseries_rows:
            disposition = db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries.idSubseries).order_by(TrdDisposition.idDisposition.desc()).first()
            types = db.query(DocumentType).filter(DocumentType.ps612IdSubseries == subseries.idSubseries).order_by(DocumentType.name.asc()).all()
            for document_type in types or [None]:
                lines.append(",".join([
                    _csv_escape(series.dependency.name if series.dependency else ""),
                    _csv_escape(series.code),
                    _csv_escape(series.name),
                    _csv_escape(subseries.name),
                    _csv_escape(document_type.name if document_type else ""),
                    _csv_escape(disposition.archive_management if disposition else ""),
                    _csv_escape(disposition.archive_central if disposition else ""),
                    _csv_escape(disposition.final_action if disposition else ""),
                    _csv_escape(disposition.procedure if disposition else ""),
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
    dependencies = {item.idDependency: item for item in db.query(TrdDependency).all()}
    by_series: dict[int, list[TrdSubseries]] = {}
    for subseries in subseries_rows:
        by_series.setdefault(subseries.ps610IdSeries, []).append(subseries)
    return [
        {
            "idSeries": series.idSeries,
            "dependency_id": series.ps608IdDependency,
            "dependency": _dependency_out(dependencies[series.ps608IdDependency]) if series.ps608IdDependency in dependencies else None,
            "code": series.code,
            "name": series.name,
            "description": series.description,
            "status": series.status,
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
    code = supplied_or_generated(db, payload.code, TrdSeries, "code", "SER")
    if db.query(TrdSeries).filter(TrdSeries.code == code).first():
        raise HTTPException(status_code=409, detail="Series code already exists")
    dependency = db.get(TrdDependency, payload.dependency_id) if payload.dependency_id else _default_dependency(db)
    if not dependency:
        raise HTTPException(status_code=422, detail="La dependencia TRD no existe.")
    item = TrdSeries(
        code=code,
        name=payload.name.strip(),
        description=payload.description,
        ps608IdDependency=dependency.idDependency,
        status=payload.status,
    )
    db.add(item)
    db.flush()
    write_audit(db, action="trd_series_created", module="trd", user_id=user.identification, entity="series", entity_id=item.idSeries, new_values=payload.model_dump() | {"code": code}, request=request)
    db.commit()
    db.refresh(item)
    return _series_out(item)


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
                "required_in_expedient": item.required_in_expedient,
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


@router.get("/expedients/{expedient_id}/lifecycle")
def expedient_lifecycle(expedient_id: int, db: Session = Depends(get_db), _: User = Depends(require_permission("document.read"))) -> dict:
    expedient = db.get(Expedient, expedient_id)
    if not expedient:
        raise HTTPException(status_code=404, detail="Expedient not found")
    series = db.get(TrdSeries, expedient.ps610IdSeries) if expedient.ps610IdSeries else None
    subseries = db.get(TrdSubseries, expedient.ps612IdSubseries) if expedient.ps612IdSubseries else None
    lifecycle = _lifecycle_from_expedient(db, expedient)
    return {
        "expedient": _expedient_out(expedient),
        "dependency": _dependency_out(series.dependency) if series and series.dependency else None,
        "series": _series_out(series) if series else None,
        "subseries": _subseries_out(subseries) if subseries else None,
        "lifecycle": lifecycle,
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
    disposition = db.query(TrdDisposition).filter(TrdDisposition.ps612IdSubseries == subseries_id).order_by(TrdDisposition.idDisposition.desc()).first()
    old_values = {
        "retention_years": item.retention_years,
        "archive_management": disposition.archive_management if disposition else None,
        "archive_central": disposition.archive_central if disposition else None,
        "final_action": disposition.final_action if disposition else None,
    }
    if payload.retention_years is not None:
        item.retention_years = payload.retention_years
    if payload.archive_management is not None or payload.archive_central is not None or payload.final_action is not None or payload.procedure is not None:
        management = payload.archive_management if payload.archive_management is not None else (disposition.archive_management if disposition else 0)
        central = payload.archive_central if payload.archive_central is not None else (disposition.archive_central if disposition else item.retention_years)
        final_action = _normalize_final_action(payload.final_action or (disposition.final_action if disposition else None))
        item.retention_years = management + central
        if disposition:
            disposition.archive_management = management
            disposition.archive_central = central
            disposition.final_action = final_action
            if payload.procedure is not None:
                disposition.procedure = payload.procedure
        else:
            db.add(TrdDisposition(ps612IdSubseries=subseries_id, archive_management=management, archive_central=central, final_action=final_action, procedure=payload.procedure))
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
        final_action=_normalize_final_action(payload.final_action),
        procedure=payload.procedure,
    )
    subseries = db.get(TrdSubseries, payload.subseries_id)
    if subseries:
        subseries.retention_years = payload.archive_management + payload.archive_central
    db.add(item)
    db.flush()
    write_audit(db, action="trd_disposition_created", module="trd", user_id=user.identification, entity="disposition", entity_id=item.idDisposition, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item
