import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AdvancedNotification, Document, Employee, EmployeeContract, EmployeeFile, EmployeeIncident, HRPosition, NotificationDeliveryLog, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event

router = APIRouter(prefix="/hr", tags=["hr"])

MANDATORY_FILES = {"hoja_vida", "contrato_firmado", "arl", "examen_ingreso"}


class EmployeeCreate(BaseModel):
    identification: str = Field(min_length=4, max_length=40)
    employee_code: str = Field(min_length=2, max_length=40)
    full_name: str = Field(min_length=3, max_length=180)
    position: str = Field(min_length=2, max_length=120)
    department: str = Field(min_length=2, max_length=120)
    hire_date: datetime

    @field_validator("identification")
    @classmethod
    def validate_identification(cls, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"[A-Za-z0-9.-]+", normalized) or not re.search(r"\d", normalized):
            raise ValueError("Identification must be a document value, not a full name")
        return normalized

    @field_validator("employee_code", "position", "department")
    @classmethod
    def strip_catalog_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", normalized) or re.fullmatch(r"[\d\s.-]+", normalized):
            raise ValueError("Full name must contain a valid person name")
        return normalized


class EmployeeFileLink(BaseModel):
    file_type: str = Field(min_length=2, max_length=80)
    document_id: int


class ContractCreate(BaseModel):
    contract_type: str = Field(min_length=2, max_length=80)
    start_date: datetime
    end_date: datetime | None = None
    status: str = "active"


class IncidentCreate(BaseModel):
    incident_type: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=3)


class PositionCreate(BaseModel):
    position_code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    level: str = Field(default="operativo", min_length=2, max_length=80)
    department: str = Field(min_length=2, max_length=120)
    description: str | None = None
    suggested_permissions: list[str] = Field(default_factory=list)
    required_documents: list[str] = Field(default_factory=lambda: ["hoja_vida", "contrato_firmado"])


def _notify_hr(db: Session, user_id: str, message: str, action_url: str) -> None:
    notification = AdvancedNotification(ps405Identification=user_id, module="hr", message=message, action_url=action_url, status="pending")
    db.add(notification)
    db.flush()
    db.add(NotificationDeliveryLog(ps1040IdNotification=notification.idNotification, delivery_channel="in_app", delivery_status="stored"))


@router.get("/positions")
def list_positions(db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    return db.query(HRPosition).order_by(HRPosition.name.asc()).all()


@router.post("/positions", status_code=status.HTTP_201_CREATED)
def create_position(payload: PositionCreate, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if db.query(HRPosition).filter(HRPosition.position_code == payload.position_code).first():
        raise HTTPException(status_code=409, detail="Position code already exists")
    item = HRPosition(
        position_code=payload.position_code.strip(),
        name=payload.name.strip(),
        level=payload.level.strip(),
        department=payload.department.strip(),
        description=payload.description,
        suggested_permissions={"items": payload.suggested_permissions},
        required_documents={"items": payload.required_documents},
        status="active",
    )
    db.add(item)
    db.flush()
    write_audit(db, action="hr_position_created", module="hr", user_id=user.identification, entity="hr_position", entity_id=item.idPosition, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.get("/employees")
def list_employees(db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    return db.query(Employee).order_by(Employee.full_name.asc()).all()


@router.post("/employees", status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeCreate, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if db.get(Employee, payload.identification):
        raise HTTPException(status_code=409, detail="Employee already exists")
    if db.query(Employee).filter(Employee.employee_code == payload.employee_code).first():
        raise HTTPException(status_code=409, detail="Employee code already exists")
    employee = Employee(**payload.model_dump(), company_id=user.company_id, status="active")
    db.add(employee)
    db.flush()
    _notify_hr(db, user.identification, f"Validar documentos obligatorios de {employee.full_name}", f"/hr?employee={employee.identification}")
    write_audit(db, action="employee_created", module="hr", user_id=user.identification, entity="employee", entity_id=employee.identification, new_values=payload.model_dump(), request=request)
    db.commit()
    publish_event("employee.created", {"employee_id": employee.identification})
    db.refresh(employee)
    return employee


@router.get("/employees/{identification}/compliance")
def employee_compliance(identification: str, db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    employee = db.get(Employee, identification)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    present = {item.file_type for item in db.query(EmployeeFile).filter(EmployeeFile.ps1010Identification == identification).all()}
    missing = sorted(MANDATORY_FILES - present)
    return {"employee": identification, "complete": not missing, "missing_files": missing, "compliance": round(((len(MANDATORY_FILES) - len(missing)) / len(MANDATORY_FILES)) * 100, 2)}


@router.post("/employees/{identification}/files", status_code=status.HTTP_201_CREATED)
def link_employee_file(identification: str, payload: EmployeeFileLink, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if not db.get(Employee, identification):
        raise HTTPException(status_code=404, detail="Employee not found")
    document = db.get(Document, payload.document_id)
    if not document or document.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    link = EmployeeFile(ps1010Identification=identification, file_type=payload.file_type, ps520IdDocument=payload.document_id)
    db.add(link)
    db.flush()
    write_audit(db, action="employee_file_linked", module="hr", user_id=user.identification, entity="employee", entity_id=identification, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(link)
    return link


@router.post("/employees/{identification}/contracts", status_code=status.HTTP_201_CREATED)
def create_contract(identification: str, payload: ContractCreate, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if not db.get(Employee, identification):
        raise HTTPException(status_code=404, detail="Employee not found")
    contract = EmployeeContract(ps1010Identification=identification, **payload.model_dump())
    db.add(contract)
    db.flush()
    write_audit(db, action="employee_contract_created", module="hr", user_id=user.identification, entity="contract", entity_id=contract.idContract, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(contract)
    return contract


@router.get("/contracts/expiring")
def expiring_contracts(days: int = 30, db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    now = datetime.now(UTC)
    horizon = now.replace() + (datetime.fromtimestamp(now.timestamp() + days * 86400, UTC) - now)
    return db.query(EmployeeContract).filter(EmployeeContract.end_date.isnot(None), EmployeeContract.end_date <= horizon, EmployeeContract.status == "active").all()


@router.post("/employees/{identification}/incidents", status_code=status.HTTP_201_CREATED)
def create_incident(identification: str, payload: IncidentCreate, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if not db.get(Employee, identification):
        raise HTTPException(status_code=404, detail="Employee not found")
    incident = EmployeeIncident(ps1010Identification=identification, **payload.model_dump())
    db.add(incident)
    db.flush()
    write_audit(db, action="employee_incident_created", module="hr", user_id=user.identification, entity="incident", entity_id=incident.idIncident, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(incident)
    return incident


@router.get("/employees/{identification}/timeline")
def employee_timeline(identification: str, db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    if not db.get(Employee, identification):
        raise HTTPException(status_code=404, detail="Employee not found")
    files = db.query(EmployeeFile).filter(EmployeeFile.ps1010Identification == identification).all()
    contracts = db.query(EmployeeContract).filter(EmployeeContract.ps1010Identification == identification).all()
    incidents = db.query(EmployeeIncident).filter(EmployeeIncident.ps1010Identification == identification).all()
    return {"files": files, "contracts": contracts, "incidents": incidents}
