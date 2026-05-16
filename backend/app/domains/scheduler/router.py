from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.deps import require_permission
from app.db.models import AdvancedNotification, EmployeeContract, NotificationDeliveryLog, User, WorkflowTask
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.events import publish_event

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.post("/daily-checks")
def run_daily_checks(request: Request, user: User = Depends(require_permission("scheduler.run")), db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    contract_horizon = now + timedelta(days=30)
    expiring_contracts = db.query(EmployeeContract).filter(EmployeeContract.end_date.isnot(None), EmployeeContract.end_date <= contract_horizon, EmployeeContract.status == "active").all()
    overdue_tasks = db.query(WorkflowTask).filter(WorkflowTask.status.in_(["pending", "in_progress"]), WorkflowTask.due_date < now).all()
    created = 0
    for contract in expiring_contracts:
        note = AdvancedNotification(ps405Identification=user.identification, module="hr", message=f"Contrato proximo a vencer: {contract.idContract}", action_url="/hr", status="pending")
        db.add(note)
        db.flush()
        db.add(NotificationDeliveryLog(ps1040IdNotification=note.idNotification, delivery_channel="in_app", delivery_status="stored"))
        publish_event("contract.expiring", {"contract_id": contract.idContract})
        created += 1
    for task in overdue_tasks:
        note = AdvancedNotification(ps405Identification=task.ps405Identification, module="workflows", message=f"SLA vencido: {task.task_name}", action_url=f"/tasks?task={task.idTask}", status="pending")
        db.add(note)
        db.flush()
        db.add(NotificationDeliveryLog(ps1040IdNotification=note.idNotification, delivery_channel="in_app", delivery_status="stored"))
        created += 1
    write_audit(db, action="scheduler_daily_checks", module="scheduler", user_id=user.identification, new_values={"notifications_created": created, "overdue_tasks": len(overdue_tasks)}, request=request)
    db.commit()
    return {"notifications_created": created, "expiring_contracts": len(expiring_contracts), "overdue_tasks": len(overdue_tasks)}
