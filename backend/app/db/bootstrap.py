from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.models import (
    Location,
    Permission,
    Role,
    RolePermission,
    TrdDisposition,
    TrdSeries,
    TrdSubseries,
    User,
    UserRole,
    Workflow,
    WorkflowStep,
)

PERMISSIONS = [
    "*",
    "auth.login",
    "users.manage",
    "document.create",
    "document.read",
    "document.read_all",
    "document.update",
    "document.transfer",
    "trd.manage",
    "transfer.manage",
    "audit.view",
    "notification.read",
    "analytics.view",
    "workflow.manage",
    "task.manage",
    "hr.view",
    "hr.manage",
    "transfer.batch_manage",
    "report.request",
    "scheduler.run",
    "search.query",
    "search.reindex",
    "platform.view",
    "ocr.manage",
    "signature.manage",
    "integration.manage",
    "webhook.manage",
    "bi.view",
    "bi.refresh",
]

ROLES = {
    "super_admin": ["*"],
    "archive_admin": [
        "document.create",
        "document.read",
        "document.read_all",
        "document.update",
        "document.transfer",
        "trd.manage",
        "transfer.manage",
        "transfer.batch_manage",
        "workflow.manage",
        "task.manage",
        "audit.view",
        "notification.read",
        "analytics.view",
        "report.request",
        "search.query",
        "search.reindex",
        "platform.view",
        "ocr.manage",
        "signature.manage",
        "integration.manage",
        "webhook.manage",
        "bi.view",
        "bi.refresh",
    ],
    "archive_analyst": ["document.read", "document.update", "trd.manage", "analytics.view", "notification.read", "search.query", "ocr.manage", "bi.view"],
    "archive_assistant": ["document.create", "document.read", "document.transfer", "task.manage", "notification.read", "search.query"],
    "hr_manager": [
        "document.create",
        "document.read",
        "document.update",
        "workflow.manage",
        "task.manage",
        "hr.view",
        "hr.manage",
        "notification.read",
        "analytics.view",
        "report.request",
        "search.query",
        "signature.manage",
        "bi.view",
    ],
    "auditor": ["document.read", "document.read_all", "audit.view", "analytics.view", "hr.view", "report.request", "search.query", "platform.view", "bi.view"],
    "viewer": ["document.read", "notification.read", "search.query"],
}


def seed_database(db: Session) -> None:
    if not db.get(Location, 1):
        db.add_all(
            [
                Location(location_name="Sede Principal", address="Principal", company_id="default"),
                Location(location_name="Archivo Central", address="Custodia", company_id="default"),
            ]
        )
        db.flush()

    permissions_by_key: dict[str, Permission] = {}
    for key in PERMISSIONS:
        permission = db.query(Permission).filter(Permission.permission_key == key).one_or_none()
        if not permission:
            module = key.split(".", 1)[0] if "." in key else "system"
            permission = Permission(permission_key=key, module=module, description=key)
            db.add(permission)
            db.flush()
        permissions_by_key[key] = permission

    roles_by_name: dict[str, Role] = {}
    for role_name, keys in ROLES.items():
        role = db.query(Role).filter(Role.role_name == role_name).one_or_none()
        if not role:
            role = Role(role_name=role_name, description=role_name.replace("_", " ").title())
            db.add(role)
            db.flush()
        roles_by_name[role_name] = role
        existing = {rp.ps409IdPermission for rp in role.permissions}
        for key in keys:
            permission = permissions_by_key[key]
            if permission.idPermission not in existing:
                db.add(RolePermission(ps407IdRole=role.idRole, ps409IdPermission=permission.idPermission))

    admin = db.get(User, "1000000000")
    if admin:
        admin.email = "admin@ambar.co"
        admin.status = "active"
    else:
        admin = User(
            identification="1000000000",
            name="Administrador Ambar",
            email="admin@ambar.co",
            password_hash=hash_password("ChangeMe123!"),
            status="active",
            company_id="default",
            location_id=1,
        )
        db.add(admin)
        db.flush()
    if not db.query(UserRole).filter(
        UserRole.ps405Identification == admin.identification,
        UserRole.ps407IdRole == roles_by_name["super_admin"].idRole,
    ).one_or_none():
        db.add(UserRole(ps405Identification=admin.identification, ps407IdRole=roles_by_name["super_admin"].idRole))

    if not db.query(TrdSeries).first():
        series = TrdSeries(code="ADM-001", name="Gestion Administrativa", description="Serie documental inicial")
        db.add(series)
        db.flush()
        subseries = TrdSubseries(ps610IdSeries=series.idSeries, name="Contratos y soportes", retention_years=5)
        db.add(subseries)
        db.flush()
        db.add(
            TrdDisposition(
                ps612IdSubseries=subseries.idSubseries,
                archive_management=2,
                archive_central=3,
                final_action="conservacion_total",
            )
        )

    if not db.query(Workflow).first():
        workflow = Workflow(
            workflow_name="Contratacion RRHH",
            description="Validacion documental, aprobacion y archivo de expediente laboral",
            module="hr",
            active=True,
        )
        db.add(workflow)
        db.flush()
        db.add_all(
            [
                WorkflowStep(ps910IdWorkflow=workflow.idWorkflow, step_name="Validar documentos", step_order=1, assigned_role="hr_manager", sla_hours=24),
                WorkflowStep(ps910IdWorkflow=workflow.idWorkflow, step_name="Aprobar expediente", step_order=2, assigned_role="hr_manager", sla_hours=24),
                WorkflowStep(ps910IdWorkflow=workflow.idWorkflow, step_name="Archivar expediente", step_order=3, assigned_role="archive_admin", sla_hours=48),
            ]
        )

    db.commit()