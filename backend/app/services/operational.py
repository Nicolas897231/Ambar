from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.db.models import AdvancedNotification, NotificationDeliveryLog, Workflow, WorkflowInstance, WorkflowStep, WorkflowTask


ACTIVE_NOTIFICATION_STATUSES = {"pending", "unread", "read", "action_required"}
ACTIVE_TASK_STATUSES = {"pending", "in_progress", "in_review", "overdue"}


def ensure_workflow(db: Session) -> Workflow:
    workflow = db.query(Workflow).filter(Workflow.workflow_name == "AMBAR Operacion Documental").one_or_none()
    if workflow:
        if not db.query(WorkflowStep).filter(WorkflowStep.ps910IdWorkflow == workflow.idWorkflow).first():
            db.add(WorkflowStep(ps910IdWorkflow=workflow.idWorkflow, step_name="Resolver alerta operacional", step_order=1, assigned_role="archive_admin", sla_hours=24))
            db.flush()
        return workflow
    workflow = Workflow(
        workflow_name="AMBAR Operacion Documental",
        description="Tareas operativas accionables generadas por custodia documental.",
        module="operations",
        active=True,
    )
    db.add(workflow)
    db.flush()
    db.add(WorkflowStep(ps910IdWorkflow=workflow.idWorkflow, step_name="Resolver alerta operacional", step_order=1, assigned_role="archive_admin", sla_hours=24))
    db.flush()
    return workflow


def notify_action(
    db: Session,
    *,
    user_id: str | None,
    module: str,
    title: str,
    message: str,
    action_url: str | None,
    action_label: str | None = None,
    archive_id: int | None = None,
    priority: str = "normal",
    notification_type: str = "system_info",
    related_entity_type: str | None = None,
    related_entity_id: str | int | None = None,
    metadata: dict | None = None,
) -> AdvancedNotification | None:
    if not user_id:
        return None
    entity_id = str(related_entity_id) if related_entity_id is not None else None
    query = db.query(AdvancedNotification).filter(
        AdvancedNotification.ps405Identification == user_id,
        AdvancedNotification.module == module,
        AdvancedNotification.notification_type == notification_type,
        AdvancedNotification.related_entity_type == related_entity_type,
        AdvancedNotification.related_entity_id == entity_id,
        AdvancedNotification.status.in_(ACTIVE_NOTIFICATION_STATUSES),
    )
    if archive_id is not None:
        query = query.filter(AdvancedNotification.ps930IdArchive == archive_id)
    existing = query.one_or_none()
    if existing:
        existing.title = title
        existing.message = message
        existing.priority = priority
        existing.action_url = action_url
        existing.action_label = action_label
        existing.metadata_json = metadata or existing.metadata_json
        existing.status = "action_required" if action_url else "unread"
        return existing
    note = AdvancedNotification(
        ps405Identification=user_id,
        ps930IdArchive=archive_id,
        module=module,
        title=title,
        message=message,
        priority=priority,
        notification_type=notification_type,
        related_entity_type=related_entity_type,
        related_entity_id=entity_id,
        action_label=action_label,
        action_url=action_url,
        status="action_required" if action_url else "unread",
        metadata_json=metadata or {},
    )
    db.add(note)
    db.flush()
    db.add(NotificationDeliveryLog(ps1040IdNotification=note.idNotification, delivery_channel="in_app", delivery_status="stored"))
    return note


def resolve_notifications(
    db: Session,
    *,
    user_id: str | None = None,
    module: str | None = None,
    notification_type: str | None = None,
    related_entity_type: str | None = None,
    related_entity_id: str | int | None = None,
) -> int:
    query = db.query(AdvancedNotification).filter(AdvancedNotification.status.in_(ACTIVE_NOTIFICATION_STATUSES))
    if user_id:
        query = query.filter(AdvancedNotification.ps405Identification == user_id)
    if module:
        query = query.filter(AdvancedNotification.module == module)
    if notification_type:
        query = query.filter(AdvancedNotification.notification_type == notification_type)
    if related_entity_type:
        query = query.filter(AdvancedNotification.related_entity_type == related_entity_type)
    if related_entity_id is not None:
        query = query.filter(AdvancedNotification.related_entity_id == str(related_entity_id))
    rows = query.all()
    now = datetime.now(UTC)
    for row in rows:
        row.status = "resolved"
        row.resolved_at = now
    return len(rows)


def create_operational_task(
    db: Session,
    *,
    assigned_to: str | None,
    title: str,
    module: str,
    archive_id: int | None = None,
    related_entity_type: str | None = None,
    related_entity_id: str | int | None = None,
    priority: str = "normal",
    due_date: datetime | None = None,
    action_url: str | None = None,
    metadata: dict | None = None,
) -> WorkflowTask | None:
    if not assigned_to:
        return None
    entity_id = str(related_entity_id) if related_entity_id is not None else None
    existing = db.query(WorkflowTask).filter(
        WorkflowTask.ps405Identification == assigned_to,
        WorkflowTask.module == module,
        WorkflowTask.related_entity_type == related_entity_type,
        WorkflowTask.related_entity_id == entity_id,
        WorkflowTask.status.in_(ACTIVE_TASK_STATUSES),
    ).one_or_none()
    if existing:
        existing.task_name = title
        existing.priority = priority
        existing.due_date = due_date or existing.due_date
        existing.action_url = action_url or existing.action_url
        existing.metadata_json = metadata or existing.metadata_json
        return existing
    workflow = ensure_workflow(db)
    instance = WorkflowInstance(ps910IdWorkflow=workflow.idWorkflow, entity_type=related_entity_type or module, entity_id=entity_id or "0", status="in_progress")
    db.add(instance)
    db.flush()
    task = WorkflowTask(
        ps914IdInstance=instance.idInstance,
        task_name=title,
        ps405Identification=assigned_to,
        ps930IdArchive=archive_id,
        module=module,
        related_entity_type=related_entity_type,
        related_entity_id=entity_id,
        priority=priority,
        status="pending",
        due_date=due_date or datetime.now(UTC) + timedelta(hours=24),
        action_url=action_url,
        metadata_json=metadata or {},
    )
    db.add(task)
    db.flush()
    notify_action(
        db,
        user_id=assigned_to,
        archive_id=archive_id,
        module=module,
        title=title,
        message=metadata.get("message", title) if metadata else title,
        priority=priority,
        notification_type="task_assigned",
        related_entity_type="task",
        related_entity_id=task.idTask,
        action_label="Abrir tarea",
        action_url=f"/tasks?task={task.idTask}",
        metadata={"source_entity_type": related_entity_type, "source_entity_id": entity_id, **(metadata or {})},
    )
    return task


def resolve_related_tasks(
    db: Session,
    *,
    related_entity_type: str | None,
    related_entity_id: str | int | None,
    module: str | None = None,
    note: str | None = None,
    completed_by: str | None = None,
) -> int:
    query = db.query(WorkflowTask).filter(
        WorkflowTask.related_entity_type == related_entity_type,
        WorkflowTask.related_entity_id == (str(related_entity_id) if related_entity_id is not None else None),
        WorkflowTask.status.in_(ACTIVE_TASK_STATUSES),
    )
    if module:
        query = query.filter(WorkflowTask.module == module)
    rows = query.all()
    now = datetime.now(UTC)
    for row in rows:
        row.status = "completed"
        row.completed_at = now
        row.completed_by = completed_by
        row.resolution_note = note
    return len(rows)
