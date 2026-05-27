from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import User, Workflow, WorkflowInstance, WorkflowStep, WorkflowTask
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event
from app.services.operational import ensure_workflow, notify_action, resolve_notifications

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
    status: str = Field(pattern="^(in_progress|in_review|approved|rejected|completed|cancelled)$")
    evidence: dict = Field(default_factory=dict)
    resolution_note: str | None = None


def _notify_task(db: Session, task: WorkflowTask) -> None:
    notify_action(
        db,
        user_id=task.ps405Identification,
        archive_id=task.ps930IdArchive,
        module=task.module or "workflows",
        title=f"Tarea asignada: {task.task_name}",
        message=f"Revisa y resuelve la tarea operativa {task.task_name}.",
        priority=task.priority or "normal",
        notification_type="task_assigned",
        related_entity_type="task",
        related_entity_id=task.idTask,
        action_label="Abrir tarea",
        action_url=task.action_url or f"/tasks?task={task.idTask}",
        metadata={"task_id": task.idTask, "source": "workflow"},
    )


def _task_to_dict(task: WorkflowTask) -> dict:
    evidence = task.evidence or {}
    return {
        "idTask": task.idTask,
        "task_name": task.task_name,
        "title": task.task_name,
        "description": evidence.get("description") or evidence.get("reason") or task.resolution_note,
        "module": task.module or "workflows",
        "archive_id": task.ps930IdArchive,
        "assigned_to": task.ps405Identification,
        "related_entity_type": task.related_entity_type,
        "related_entity_id": task.related_entity_id,
        "priority": task.priority or "normal",
        "status": task.status,
        "due_date": task.due_date,
        "completed_at": task.completed_at,
        "completed_by": task.completed_by,
        "resolution_note": task.resolution_note,
        "action_url": task.action_url or f"/tasks?task={task.idTask}",
        "metadata": task.metadata_json or {},
        "evidence": evidence,
    }


def _refresh_overdue_tasks(db: Session, user: User, request: Request | None = None) -> int:
    now = datetime.now(UTC)
    rows = db.query(WorkflowTask).filter(
        WorkflowTask.ps405Identification == user.identification,
        WorkflowTask.status.in_(["pending", "in_progress", "in_review"]),
        WorkflowTask.due_date < now,
    ).all()
    for task in rows:
        old_status = task.status
        task.status = "overdue"
        notify_action(
            db,
            user_id=task.ps405Identification,
            archive_id=task.ps930IdArchive,
            module=task.module or "workflows",
            title=f"Tarea vencida: {task.task_name}",
            message="Esta tarea supero su fecha limite y requiere accion.",
            priority="high",
            notification_type="task_overdue",
            related_entity_type="task",
            related_entity_id=task.idTask,
            action_label="Resolver tarea",
            action_url=task.action_url or f"/tasks?task={task.idTask}",
            metadata={"previous_status": old_status},
        )
        if request:
            write_audit(db, action="workflow_task_overdue", module="workflows", user_id=user.identification, entity="workflow_task", entity_id=task.idTask, old_values={"status": old_status}, new_values={"status": "overdue"}, request=request)
    return len(rows)


@router.get("")
def list_workflows(db: Session = Depends(get_db), _: User = Depends(require_permission("workflow.manage"))):
    ensure_workflow(db)
    db.commit()
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
        module=workflow.module,
        related_entity_type=payload.entity_type,
        related_entity_id=payload.entity_id,
        priority="normal",
        status="pending",
        due_date=datetime.now(UTC) + timedelta(hours=first_step.sla_hours),
        action_url=f"/tasks?entity={payload.entity_type}-{payload.entity_id}",
        metadata_json={"workflow_id": workflow_id, "step_id": first_step.idStep},
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
    request: Request,
    status_filter: str = Query(default="active", alias="status"),
    module: str | None = None,
    priority: str | None = None,
    archive_id: int | None = None,
    include_history: bool = True,
    user: User = Depends(require_permission("task.manage")),
    db: Session = Depends(get_db),
):
    _refresh_overdue_tasks(db, user, request)
    query = db.query(WorkflowTask).filter(WorkflowTask.ps405Identification == user.identification)
    if status_filter == "active":
        query = query.filter(WorkflowTask.status.in_(["pending", "in_progress", "in_review", "overdue"]))
    elif status_filter != "all":
        query = query.filter(WorkflowTask.status == status_filter)
    elif not include_history:
        query = query.filter(WorkflowTask.status.notin_(["completed", "approved", "rejected", "cancelled"]))
    if module:
        query = query.filter(WorkflowTask.module == module)
    if priority:
        query = query.filter(WorkflowTask.priority == priority)
    if archive_id:
        query = query.filter(WorkflowTask.ps930IdArchive == archive_id)
    rows = [_task_to_dict(item) for item in query.order_by(WorkflowTask.due_date.asc()).limit(200).all()]
    db.commit()
    return rows


@router.get("/tasks/summary")
def tasks_summary(request: Request, user: User = Depends(require_permission("task.manage")), db: Session = Depends(get_db)):
    _refresh_overdue_tasks(db, user, request)
    rows = db.query(WorkflowTask).filter(WorkflowTask.ps405Identification == user.identification).all()
    db.commit()
    return {
        "pending": sum(1 for item in rows if item.status in {"pending", "in_progress", "in_review"}),
        "overdue": sum(1 for item in rows if item.status == "overdue"),
        "completed": sum(1 for item in rows if item.status in {"completed", "approved"}),
        "rejected": sum(1 for item in rows if item.status == "rejected"),
        "critical": sum(1 for item in rows if item.priority == "critical" and item.status not in {"completed", "approved", "rejected", "cancelled"}),
    }


@router.post("/tasks/check-overdue")
def check_overdue_tasks(request: Request, user: User = Depends(require_permission("task.manage")), db: Session = Depends(get_db)):
    updated = _refresh_overdue_tasks(db, user, request)
    db.commit()
    return {"updated": updated}


@router.get("/tasks/{task_id}")
def get_task(task_id: int, user: User = Depends(require_permission("task.manage")), db: Session = Depends(get_db)):
    task = db.get(WorkflowTask, task_id)
    if not task or task.ps405Identification != user.identification:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_dict(task)


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
        task.completed_by = user.identification
        task.resolution_note = payload.resolution_note or payload.evidence.get("reason") or payload.evidence.get("note")
    instance = db.get(WorkflowInstance, task.ps914IdInstance)
    if instance and payload.status in {"approved", "completed"}:
        instance.status = "completed"
        instance.completed_at = datetime.now(UTC)
        publish_event("workflow.completed", {"instance_id": instance.idInstance})
    elif instance and payload.status in {"rejected", "cancelled"}:
        instance.status = payload.status
    resolve_notifications(db, user_id=user.identification, related_entity_type="task", related_entity_id=task.idTask)
    write_audit(db, action="workflow_task_updated", module="workflows", user_id=user.identification, entity="workflow_task", entity_id=task.idTask, old_values={"status": old_status}, new_values=payload.model_dump(), request=request)
    db.commit()
    db.refresh(task)
    return _task_to_dict(task)


@router.post("/tasks/{task_id}/start")
def start_task(task_id: int, request: Request, user: User = Depends(require_permission("task.manage")), db: Session = Depends(get_db)):
    return update_task(task_id, TaskAction(status="in_progress", evidence={"source": "task_start"}), request, user, db)


@router.post("/tasks/{task_id}/complete")
def complete_task(task_id: int, request: Request, payload: TaskAction | None = None, user: User = Depends(require_permission("task.manage")), db: Session = Depends(get_db)):
    action = payload or TaskAction(status="completed", evidence={"source": "task_complete"})
    action.status = "completed"
    return update_task(task_id, action, request, user, db)


@router.post("/tasks/{task_id}/reject")
def reject_task(task_id: int, payload: TaskAction, request: Request, user: User = Depends(require_permission("task.manage")), db: Session = Depends(get_db)):
    payload.status = "rejected"
    return update_task(task_id, payload, request, user, db)


@router.post("/tasks/{task_id}/cancel")
def cancel_task(task_id: int, request: Request, payload: TaskAction | None = None, user: User = Depends(require_permission("task.manage")), db: Session = Depends(get_db)):
    action = payload or TaskAction(status="cancelled", evidence={"source": "task_cancel"})
    action.status = "cancelled"
    return update_task(task_id, action, request, user, db)


@router.get("/instances")
def list_instances(db: Session = Depends(get_db), _: User = Depends(require_permission("workflow.manage"))):
    return db.query(WorkflowInstance).order_by(WorkflowInstance.started_at.desc()).all()
