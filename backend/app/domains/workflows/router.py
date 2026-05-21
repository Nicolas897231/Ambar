from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AdvancedNotification, NotificationDeliveryLog, User, Workflow, WorkflowInstance, WorkflowStep, WorkflowTask
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event

router = APIRouter(prefix="/workflows", tags=["workflows"])


class WorkflowCreate(BaseModel):
    workflow_name: str = Field(min_length=3, max_length=160)
    description: str | None = None
    module: str = Field(min_length=2, max_length=80)


class WorkflowStepCreate(BaseModel):
    step_name: str = Field(min_length=3, max_length=160)
    step_order: int = Field(ge=1)
    assigned_role: str = Field(min_length=3, max_length=80)
    sla_hours: int = Field(default=24, ge=1, le=720)


class WorkflowStart(BaseModel):
    entity_type: str = Field(min_length=2, max_length=80)
    entity_id: str = Field(min_length=1, max_length=80)
    assignee_identification: str


class TaskAction(BaseModel):
    status: str = Field(pattern="^(in_progress|approved|rejected|completed|cancelled)$")
    evidence: dict = Field(default_factory=dict)


def _notify_task(db: Session, task: WorkflowTask) -> None:
    note = AdvancedNotification(
        ps405Identification=task.ps405Identification,
        module="workflows",
        message=f"Tarea asignada: {task.task_name}",
        action_url=f"/tasks?task={task.idTask}",
        status="pending",
    )
    db.add(note)
    db.flush()
    db.add(NotificationDeliveryLog(ps1040IdNotification=note.idNotification, delivery_channel="in_app", delivery_status="stored"))


@router.get("")
def list_workflows(db: Session = Depends(get_db), _: User = Depends(require_permission("workflow.manage"))):
    return db.query(Workflow).order_by(Workflow.workflow_name.asc()).all()


@router.post("", status_code=status.HTTP_201_CREATED)
def create_workflow(payload: WorkflowCreate, request: Request, user: User = Depends(require_permission("workflow.manage")), db: Session = Depends(get_db)):
    item = Workflow(**payload.model_dump(), active=True)
    db.add(item)
    db.flush()
    write_audit(db, action="workflow_created", module="workflows", user_id=user.identification, entity="workflow", entity_id=item.idWorkflow, new_values=payload.model_dump(), request=request)
    db.commit()
    publish_event("workflow.created", {"workflow_id": item.idWorkflow})
    db.refresh(item)
    return item


@router.post("/{workflow_id}/steps", status_code=status.HTTP_201_CREATED)
def add_step(workflow_id: int, payload: WorkflowStepCreate, request: Request, user: User = Depends(require_permission("workflow.manage")), db: Session = Depends(get_db)):
    if not db.get(Workflow, workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    item = WorkflowStep(ps910IdWorkflow=workflow_id, **payload.model_dump())
    db.add(item)
    db.flush()
    write_audit(db, action="workflow_step_created", module="workflows", user_id=user.identification, entity="workflow_step", entity_id=item.idStep, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{workflow_id}/start", status_code=status.HTTP_201_CREATED)
def start_workflow(workflow_id: int, payload: WorkflowStart, request: Request, user: User = Depends(require_permission("workflow.manage")), db: Session = Depends(get_db)):
    workflow = db.get(Workflow, workflow_id)
    if not workflow or not workflow.active:
        raise HTTPException(status_code=404, detail="Workflow not found")
    first_step = db.query(WorkflowStep).filter(WorkflowStep.ps910IdWorkflow == workflow_id).order_by(WorkflowStep.step_order.asc()).first()
    if not first_step:
        raise HTTPException(status_code=409, detail="Workflow has no steps")
    instance = WorkflowInstance(ps910IdWorkflow=workflow_id, entity_type=payload.entity_type, entity_id=payload.entity_id, status="in_progress")
    db.add(instance)
    db.flush()
    task = WorkflowTask(
        ps914IdInstance=instance.idInstance,
        task_name=first_step.step_name,
        ps405Identification=payload.assignee_identification,
        status="pending",
        due_date=datetime.now(UTC) + timedelta(hours=first_step.sla_hours),
    )
    db.add(task)
    db.flush()
    _notify_task(db, task)
    write_audit(db, action="workflow_started", module="workflows", user_id=user.identification, entity="workflow_instance", entity_id=instance.idInstance, new_values=payload.model_dump(), request=request)
    db.commit()
    publish_event("task.assigned", {"task_id": task.idTask, "instance_id": instance.idInstance})
    db.refresh(instance)
    return instance


@router.get("/tasks")
def list_tasks(
    status_filter: str = Query(default="active", alias="status"),
    user: User = Depends(require_permission("task.manage")),
    db: Session = Depends(get_db),
):
    query = db.query(WorkflowTask).filter(WorkflowTask.ps405Identification == user.identification)
    if status_filter == "active":
        query = query.filter(WorkflowTask.status.in_(["pending", "in_progress", "overdue"]))
    elif status_filter != "all":
        query = query.filter(WorkflowTask.status == status_filter)
    return query.order_by(WorkflowTask.due_date.asc()).all()


@router.patch("/tasks/{task_id}")
def update_task(task_id: int, payload: TaskAction, request: Request, user: User = Depends(require_permission("task.manage")), db: Session = Depends(get_db)):
    task = db.get(WorkflowTask, task_id)
    if not task or task.ps405Identification != user.identification:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status in {"approved", "rejected", "completed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Task is already closed")
    if payload.status == "rejected" and not str(payload.evidence.get("reason", "")).strip():
        raise HTTPException(status_code=422, detail="Rejection reason is required")
    old_status = task.status
    task.status = payload.status
    task.evidence = payload.evidence
    if payload.status in {"approved", "rejected", "completed", "cancelled"}:
        task.completed_at = datetime.now(UTC)
    instance = db.get(WorkflowInstance, task.ps914IdInstance)
    if instance and payload.status in {"approved", "completed"}:
        instance.status = "completed"
        instance.completed_at = datetime.now(UTC)
        publish_event("workflow.completed", {"instance_id": instance.idInstance})
    elif instance and payload.status in {"rejected", "cancelled"}:
        instance.status = payload.status
    db.query(AdvancedNotification).filter(
        AdvancedNotification.ps405Identification == user.identification,
        AdvancedNotification.action_url == f"/tasks?task={task.idTask}",
        AdvancedNotification.status == "pending",
    ).update({"status": "actioned"})
    write_audit(db, action="workflow_task_updated", module="workflows", user_id=user.identification, entity="workflow_task", entity_id=task.idTask, old_values={"status": old_status}, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(task)
    return task


@router.get("/instances")
def list_instances(db: Session = Depends(get_db), _: User = Depends(require_permission("workflow.manage"))):
    return db.query(WorkflowInstance).order_by(WorkflowInstance.started_at.desc()).all()
