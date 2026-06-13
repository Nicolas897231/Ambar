import re
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AdvancedNotification, Document, Employee, EmployeeContract, EmployeeFile, EmployeeIncident, HRCandidate, HRDepartment, HRPosition, HRVacancy, NotificationDeliveryLog, User
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event
from app.services.storage import store_file

router = APIRouter(prefix="/hr", tags=["hr"])

MANDATORY_FILES = {"hoja_vida", "contrato_firmado", "arl", "examen_ingreso"}


class EmployeeCreate(BaseModel):
    identification: str = Field(min_length=6, max_length=12)
    employee_code: str = Field(min_length=2, max_length=40)
    full_name: str = Field(min_length=3, max_length=180)
    position: str = Field(min_length=2, max_length=120)
    department: str = Field(min_length=2, max_length=120)
    hire_date: datetime

    @field_validator("identification")
    @classmethod
    def validate_identification(cls, value: str) -> str:
        normalized = value.strip()
        if not re.fullmatch(r"\d{6,12}", normalized):
            raise ValueError("Identification must contain only 6 to 12 digits")
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
        if not re.search(r"[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]", normalized) or re.fullmatch(r"[\d\s.-]+", normalized):
            raise ValueError("Candidate name must contain a valid person name")
        return normalized


class VacancyCreate(BaseModel):
    vacancy_code: str = Field(min_length=2, max_length=50)
    title: str = Field(min_length=3, max_length=160)
    department: str = Field(min_length=2, max_length=120)
    position_id: int | None = None
    description: str | None = None
    requirements: list[str] = Field(default_factory=list)
    contract_type: str | None = None
    location: str | None = None
    status: str = Field(default="open", pattern="^(open|paused|closed)$")
    closes_at: datetime | None = None

    @field_validator("title", "department", "vacancy_code")
    @classmethod
    def strip_required(cls, value: str) -> str:
        return " ".join(value.strip().split())


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


class PositionChange(BaseModel):
    new_position: str = Field(min_length=2, max_length=120)
    new_department: str | None = Field(default=None, max_length=120)
    effective_date: datetime | None = None
    observation: str | None = None


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


def _vacancy_out(vacancy: HRVacancy) -> dict:
    return {
        "idVacancy": vacancy.idVacancy,
        "vacancy_code": vacancy.vacancy_code,
        "title": vacancy.title,
        "department": vacancy.department,
        "position_id": vacancy.ps1008IdPosition,
        "description": vacancy.description,
        "requirements": (vacancy.requirements or {}).get("items", []),
        "contract_type": vacancy.contract_type,
        "location": vacancy.location,
        "status": vacancy.status,
        "published_at": vacancy.published_at,
        "closes_at": vacancy.closes_at,
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


def _required_documents_for_employee(db: Session, employee: Employee) -> set[str]:
    position = (
        db.query(HRPosition)
        .filter(HRPosition.name == employee.position, HRPosition.status == "active")
        .order_by(HRPosition.idPosition.desc())
        .first()
    )
    if position and position.required_documents:
        items = position.required_documents.get("items") or []
        if items:
            return set(items)
    return set(MANDATORY_FILES)


@router.get("/public/vacancies")
def public_vacancies(db: Session = Depends(get_db)):
    vacancies = (
        db.query(HRVacancy)
        .filter(HRVacancy.status == "open")
        .order_by(HRVacancy.published_at.desc(), HRVacancy.created_at.desc())
        .all()
    )
    return [_vacancy_out(item) for item in vacancies]


@router.post("/public/vacancies/{vacancy_id}/apply", status_code=status.HTTP_201_CREATED)
async def public_apply_vacancy(
    vacancy_id: int,
    full_name: str = Form(...),
    email: str = Form(...),
    phone: str | None = Form(None),
    observation: str | None = Form(None),
    resume: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    vacancy = db.get(HRVacancy, vacancy_id)
    if not vacancy or vacancy.status != "open":
        raise HTTPException(status_code=404, detail="Vacancy not found")
    normalized_name = " ".join(full_name.strip().split())
    if len(normalized_name) < 3 or re.search(r"\d", normalized_name):
        raise HTTPException(status_code=422, detail="Full name must contain valid text")
    normalized_email = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized_email):
        raise HTTPException(status_code=422, detail="Email format is invalid")
    existing = db.query(HRCandidate).filter(HRCandidate.email == normalized_email, HRCandidate.status != "rechazado").first()
    if existing:
        raise HTTPException(status_code=409, detail="Candidate email already exists")
    resume_payload = None
    if resume:
        content = await resume.read()
        try:
            resume_payload = store_file(company_id="public", module="job-applications", file=resume, content=content)
        except ValueError as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from exc
    candidate = HRCandidate(
        candidate_code=f"WEB-{vacancy.idVacancy}-{uuid4().hex[:10]}",
        full_name=normalized_name,
        email=normalized_email,
        phone=phone.strip() if phone else None,
        position_applied=vacancy.title,
        department=vacancy.department,
        observations={"items": [item for item in [observation] if item], "source": "portal_empleo", "vacancy_id": vacancy.idVacancy, "resume": resume_payload},
        created_by=None,
        status="postulado",
    )
    db.add(candidate)
    db.flush()
    owner = db.query(User).filter(User.status == "active").order_by(User.identification.asc()).first()
    if owner:
        db.add(
            AdvancedNotification(
                ps405Identification=owner.identification,
                module="hr",
                title="Nueva postulacion desde portal empleo",
                message=f"{candidate.full_name} aplico a {vacancy.title}",
                priority="normal",
                notification_type="task_assigned",
                related_entity_type="hr_candidate",
                related_entity_id=str(candidate.idCandidate),
                action_label="Revisar candidato",
                action_url=f"/recruitment?candidate={candidate.idCandidate}",
                status="action_required",
            )
        )
    db.commit()
    return {"status": "received", "candidate_id": candidate.idCandidate}


def _employee_checklist(db: Session, employee: Employee) -> dict:
    required = sorted(_required_documents_for_employee(db, employee))
    present = {item.file_type for item in db.query(EmployeeFile).filter(EmployeeFile.ps1010Identification == employee.identification).all()}
    items = [{"file_type": item, "complete": item in present} for item in required]
    completed = sum(1 for item in items if item["complete"])
    return {
        "required": required,
        "items": items,
        "missing_files": [item["file_type"] for item in items if not item["complete"]],
        "complete": completed == len(items),
        "compliance": round((completed / len(items)) * 100, 2) if items else 100,
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


@router.get("/vacancies")
def list_vacancies(status_filter: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    query = db.query(HRVacancy)
    if status_filter:
        query = query.filter(HRVacancy.status == status_filter)
    return [_vacancy_out(item) for item in query.order_by(HRVacancy.created_at.desc()).all()]


@router.post("/vacancies", status_code=status.HTTP_201_CREATED)
def create_vacancy(payload: VacancyCreate, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if db.query(HRVacancy).filter(HRVacancy.vacancy_code == payload.vacancy_code).first():
        raise HTTPException(status_code=409, detail="Vacancy code already exists")
    if payload.position_id and not db.get(HRPosition, payload.position_id):
        raise HTTPException(status_code=404, detail="Position not found")
    vacancy = HRVacancy(
        vacancy_code=payload.vacancy_code,
        title=payload.title,
        department=payload.department,
        ps1008IdPosition=payload.position_id,
        description=payload.description,
        requirements={"items": payload.requirements},
        contract_type=payload.contract_type,
        location=payload.location,
        status=payload.status,
        published_at=datetime.now(UTC) if payload.status == "open" else None,
        closes_at=payload.closes_at,
        created_by=user.identification,
    )
    db.add(vacancy)
    db.flush()
    write_audit(db, action="hr_vacancy_created", module="hr", user_id=user.identification, entity="hr_vacancy", entity_id=vacancy.idVacancy, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(vacancy)
    return _vacancy_out(vacancy)


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
    if candidate.resume_document_id:
        db.add(EmployeeFile(ps1010Identification=employee.identification, file_type="hoja_vida", ps520IdDocument=candidate.resume_document_id))
    _notify_hr(db, user.identification, f"Completar onboarding documental de {employee.full_name}", f"/hr?view=employees&employee={employee.identification}")
    checklist = _employee_checklist(db, employee)
    write_audit(db, action="hr_candidate_hired", module="hr", user_id=user.identification, entity="hr_candidate", entity_id=candidate.idCandidate, new_values={"employee": employee.identification, "checklist": checklist["required"], "resume_reused": bool(candidate.resume_document_id)}, request=request)
    db.commit()
    publish_event("employee.created", {"employee_id": employee.identification, "source": "candidate"})
    db.refresh(employee)
    return {"employee": employee, "candidate": _candidate_out(candidate), "onboarding_checklist": checklist, "timeline": ["candidate.hired", "employee.created", "candidate.documents.reused", "onboarding.created"]}


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
    return {"employee": identification, **_employee_checklist(db, employee)}


@router.post("/employees/{identification}/files", status_code=status.HTTP_201_CREATED)
def link_employee_file(identification: str, payload: EmployeeFileLink, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    if not db.get(Employee, identification):
        raise HTTPException(status_code=404, detail="Employee not found")
    document = db.get(Document, payload.document_id)
    if not document or document.company_id != user.company_id:
        raise HTTPException(status_code=404, detail="Document not found")
    existing = db.query(EmployeeFile).filter(EmployeeFile.ps1010Identification == identification, EmployeeFile.file_type == payload.file_type).one_or_none()
    if existing:
        existing.ps520IdDocument = payload.document_id
        link = existing
    else:
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


@router.get("/sst/exams")
def sst_exams(db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    exam_types = {"examen_ingreso", "examen_periodico", "examen_retiro", "certificado_medico"}
    incidents = (
        db.query(EmployeeIncident)
        .filter(EmployeeIncident.incident_type.in_(exam_types))
        .order_by(EmployeeIncident.created_at.desc())
        .all()
    )
    return incidents


@router.get("/sst/alerts")
def sst_alerts(db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    employees = db.query(Employee).filter(Employee.status == "active").order_by(Employee.full_name.asc()).all()
    alerts = []
    for employee in employees:
        checklist = _employee_checklist(db, employee)
        if "examen_ingreso" in checklist["missing_files"]:
            alerts.append({
                "employee": employee.identification,
                "full_name": employee.full_name,
                "department": employee.department,
                "alert": "Examen de ingreso pendiente",
                "priority": "high",
            })
    return alerts


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


@router.post("/employees/{identification}/position-changes", status_code=status.HTTP_201_CREATED)
def change_employee_position(identification: str, payload: PositionChange, request: Request, user: User = Depends(require_permission("hr.manage")), db: Session = Depends(get_db)):
    employee = db.get(Employee, identification)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    old_values = {"position": employee.position, "department": employee.department}
    employee.position = payload.new_position.strip()
    if payload.new_department:
        employee.department = payload.new_department.strip()
    incident = EmployeeIncident(
        ps1010Identification=identification,
        incident_type="cargo_change",
        description=payload.observation or f"Cambio de cargo: {old_values['position']} -> {employee.position}",
    )
    db.add(incident)
    write_audit(db, action="employee_position_changed", module="hr", user_id=user.identification, entity="employee", entity_id=identification, old_values=old_values, new_values={"position": employee.position, "department": employee.department, "effective_date": payload.effective_date}, request=request)
    db.commit()
    db.refresh(incident)
    return {"employee": employee, "change": incident, "checklist": _employee_checklist(db, employee)}


@router.get("/employees/{identification}/timeline")
def employee_timeline(identification: str, db: Session = Depends(get_db), _: User = Depends(require_permission("hr.view"))):
    if not db.get(Employee, identification):
        raise HTTPException(status_code=404, detail="Employee not found")
    files = db.query(EmployeeFile).filter(EmployeeFile.ps1010Identification == identification).all()
    contracts = db.query(EmployeeContract).filter(EmployeeContract.ps1010Identification == identification).all()
    incidents = db.query(EmployeeIncident).filter(EmployeeIncident.ps1010Identification == identification).all()
    return {"files": files, "contracts": contracts, "incidents": incidents}
