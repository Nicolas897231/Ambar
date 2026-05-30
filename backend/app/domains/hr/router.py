import re
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AdvancedNotification, Document, Employee, EmployeeContract, EmployeeFile, EmployeeIncident, HRCandidate, HRDepartment, HRPosition, NotificationDeliveryLog, User
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


class DepartmentCreate(BaseModel):
    department_code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    parent_id: int | None = None
    responsible_identification: str | None = None


class CandidateCreate(BaseModel):
    candidate_code: str = Field(min_length=2, max_length=40)
    full_name: str = Field(min_length=3, max_length=180)
    email: str | None = None
    phone: str | None = None
    position_applied: str = Field(min_length=2, max_length=120)
    department: str = Field(min_length=2, max_length=120)
    resume_document_id: int | None = None
    observations: str | None = None

    @field_validator("full_name")
    @classmethod
    def validate_candidate_name(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not re.search(r"[A-Za-zÃÃ‰ÃÃ“ÃšÃœÃ‘Ã¡Ã©Ã­Ã³ÃºÃ¼Ã±]", normalized) or re.fullmatch(r"[\d\s.-]+", normalized):
            raise ValueError("Candidate name must contain a valid person name")
        return normalized


class CandidateStatusUpdate(BaseModel):
    status: str = Field(pattern="^(postulado|entrevista|validacion|aprobado|rechazado|contratado)$")
    observation: str | None = None


class CandidateHire(BaseModel):
    identification: str = Field(min_length=4, max_length=40)
    employee_code: str | None = None
    hire_date: datetime | None = None

    @field_validator("identification")
    @classmethod
    def validate_identification(cls, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"\d+", normalized):
            raise ValueError("Identification must be numeric")
        return normalized


def _notify_hr(db: Session, user_id: str, message: str, action_url: str) -> None:
    notification = AdvancedNotification(ps405Identification=user_id, module="hr", message=message, action_url=action_url, status="pending")
    db.add(notification)
    db.flush()
    db.add(NotificationDeliveryLog(ps1040IdNotification=notification.idNotification, delivery_channel="in_app", delivery_status="stored"))


def _candidate_out(candidate: HRCandidate) -> dict:
    return {
        "idCandidate": candidate.idCandidate,
        "candidate_code": candidate.candidate_code,
        "full_name": candidate.full_name,
        "email": candidate.email,
        "phone": candidate.phone,
        "position_applied": candidate.position_applied,
        "department": candidate.department,
        "status": candidate.status,
        "resume_document_id": candidate.resume_document_id,
        "observations": candidate.observations or {},
        "hired_employee_id": candidate.hired_employee_id,
        "created_at": candidate.created_at,
    }


def _department_node(department: HRDepartment, children_by_parent: dict[int | None, list[HRDepartment]]) -> dict:
    return {
        "idDepartment": department.idDepartment,
        "department_code": department.department_code,
        "name": department.name,
        "responsible_identification": department.responsible_identification,
        "status": department.status,
        "children": [_department_node(child, children_by_parent) for child in children_by_parent.get(department.idDepartment, [])],
    }


@router.get("/departments")
def list_departments(db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    return db.query(HRDepartment).order_by(HRDepartment.name.asc()).all()


@router.post("/departments", status_code=status.HTTP_201_CREATED)
def create_department(payload: DepartmentCreate, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if db.query(HRDepartment).filter(HRDepartment.department_code == payload.department_code).first():
        raise HTTPException(status_code=409, detail="Department code already exists")
    if payload.parent_id and not db.get(HRDepartment, payload.parent_id):
        raise HTTPException(status_code=404, detail="Parent department not found")
    department = HRDepartment(
        department_code=payload.department_code.strip(),
        name=payload.name.strip(),
        parent_id=payload.parent_id,
        responsible_identification=payload.responsible_identification,
        status="active",
    )
    db.add(department)
    db.flush()
    write_audit(db, action="hr_department_created", module="hr", user_id=user.identification, entity="hr_department", entity_id=department.idDepartment, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(department)
    return department


@router.get("/departments/tree")
def department_tree(db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    departments = db.query(HRDepartment).order_by(HRDepartment.name.asc()).all()
    children_by_parent: dict[int | None, list[HRDepartment]] = {}
    for department in departments:
        children_by_parent.setdefault(department.parent_id, []).append(department)
    return [_department_node(item, children_by_parent) for item in children_by_parent.get(None, [])]


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


@router.get("/candidates")
def list_candidates(status_filter: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    query = db.query(HRCandidate)
    if status_filter:
        query = query.filter(HRCandidate.status == status_filter)
    return [_candidate_out(item) for item in query.order_by(HRCandidate.created_at.desc()).all()]


@router.post("/candidates", status_code=status.HTTP_201_CREATED)
def create_candidate(payload: CandidateCreate, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if db.query(HRCandidate).filter(HRCandidate.candidate_code == payload.candidate_code).first():
        raise HTTPException(status_code=409, detail="Candidate code already exists")
    if payload.email and db.query(HRCandidate).filter(HRCandidate.email == payload.email, HRCandidate.status != "rechazado").first():
        raise HTTPException(status_code=409, detail="Candidate email already exists")
    if payload.resume_document_id and not db.get(Document, payload.resume_document_id):
        raise HTTPException(status_code=404, detail="Resume document not found")
    candidate = HRCandidate(
        candidate_code=payload.candidate_code.strip(),
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        position_applied=payload.position_applied.strip(),
        department=payload.department.strip(),
        resume_document_id=payload.resume_document_id,
        observations={"items": [payload.observations]} if payload.observations else {"items": []},
        created_by=user.identification,
        status="postulado",
    )
    db.add(candidate)
    db.flush()
    _notify_hr(db, user.identification, f"Revisar candidato {candidate.full_name}", f"/hr?view=candidates&candidate={candidate.idCandidate}")
    write_audit(db, action="hr_candidate_created", module="hr", user_id=user.identification, entity="hr_candidate", entity_id=candidate.idCandidate, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(candidate)
    return _candidate_out(candidate)


@router.patch("/candidates/{candidate_id}/status")
def update_candidate_status(candidate_id: int, payload: CandidateStatusUpdate, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    candidate = db.get(HRCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    old_values = {"status": candidate.status, "observations": candidate.observations}
    observations = dict(candidate.observations or {"items": []})
    if payload.observation:
        observations.setdefault("items", []).append(payload.observation)
    candidate.status = payload.status
    candidate.observations = observations
    write_audit(db, action="hr_candidate_status_updated", module="hr", user_id=user.identification, entity="hr_candidate", entity_id=candidate.idCandidate, old_values=old_values, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(candidate)
    return _candidate_out(candidate)


@router.post("/candidates/{candidate_id}/hire", status_code=status.HTTP_201_CREATED)
def hire_candidate(candidate_id: int, payload: CandidateHire, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    candidate = db.get(HRCandidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if candidate.status not in {"aprobado", "validacion"}:
        raise HTTPException(status_code=409, detail="Candidate must be approved before hiring")
    if db.get(Employee, payload.identification):
        raise HTTPException(status_code=409, detail="Employee already exists")
    employee_code = payload.employee_code or f"EMP-{payload.identification}"
    if db.query(Employee).filter(Employee.employee_code == employee_code).first():
        raise HTTPException(status_code=409, detail="Employee code already exists")
    employee = Employee(
        identification=payload.identification,
        employee_code=employee_code,
        full_name=candidate.full_name,
        position=candidate.position_applied,
        department=candidate.department,
        hire_date=payload.hire_date or datetime.now(UTC),
        company_id=user.company_id,
        status="active",
    )
    db.add(employee)
    db.flush()
    candidate.status = "contratado"
    candidate.hired_employee_id = employee.identification
    _notify_hr(db, user.identification, f"Completar onboarding documental de {employee.full_name}", f"/hr?view=employees&employee={employee.identification}")
    write_audit(db, action="hr_candidate_hired", module="hr", user_id=user.identification, entity="hr_candidate", entity_id=candidate.idCandidate, new_values={"employee": employee.identification, "checklist": sorted(MANDATORY_FILES)}, request=request)
    db.commit()
    publish_event("employee.created", {"employee_id": employee.identification, "source": "candidate"})
    db.refresh(employee)
    return {"employee": employee, "candidate": _candidate_out(candidate), "onboarding_checklist": sorted(MANDATORY_FILES), "timeline": ["candidate.hired", "employee.created", "onboarding.created"]}


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
