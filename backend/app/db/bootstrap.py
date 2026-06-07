from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.models import (
    Archive,
    ArchiveUser,
    Expedient,
    Folder,
    HRDepartment,
    HRPosition,
    Location,
    Permission,
    Role,
    RolePermission,
    TrdDisposition,
    TrdDependency,
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
    "document.download",
    "document.update",
    "document.transfer",
        "archive.manage",
    "trd.manage",
    "transfer.manage",
    "audit.view",
    "audit.export",
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

for _module in ["archive", "audit", "auth", "bi", "document", "hr", "notification", "platform", "search", "transfer", "trd", "users"]:
    for _action in ["view", "create", "update", "approve", "audit"]:
        _permission = f"{_module}.{_action}"
        if _permission not in PERMISSIONS:
            PERMISSIONS.append(_permission)

ROLES = {
    "super_admin": ["*"],
    "archive_admin": [
        "document.create",
        "document.read",
        "document.read_all",
        "document.download",
        "document.update",
        "document.transfer",
        "archive.manage",
        "trd.manage",
        "transfer.manage",
        "transfer.batch_manage",
        "workflow.manage",
        "task.manage",
        "audit.view",
        "audit.export",
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
    "archive_analyst": ["document.read", "document.download", "document.update", "trd.manage", "analytics.view", "notification.read", "search.query", "ocr.manage", "bi.view"],
    "archive_assistant": ["document.create", "document.read", "document.download", "document.transfer", "task.manage", "notification.read", "search.query"],
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
    "auditor": ["document.read", "document.read_all", "document.download", "audit.view", "audit.export", "analytics.view", "hr.view", "report.request", "search.query", "platform.view", "bi.view"],
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

    default_archive = db.query(Archive).filter(Archive.archive_code == "ARCH-BOG-CENTRAL").one_or_none()
    if not default_archive:
        default_archive = Archive(
            archive_code="ARCH-BOG-CENTRAL",
            archive_name="Archivo Central Bogota",
            archive_type="central",
            ps700IdLocation=1,
            description="Archivo central inicial para operacion SGDEA",
            responsible_identification=admin.identification,
            custodian_identification=admin.identification,
            capacity_units=100000,
            physical_location="Sede Principal",
            metadata_json={"seed": True},
        )
        db.add(default_archive)
        db.flush()
    if not db.query(ArchiveUser).filter(
        ArchiveUser.ps930IdArchive == default_archive.idArchive,
        ArchiveUser.ps405Identification == admin.identification,
    ).one_or_none():
        db.add(ArchiveUser(ps930IdArchive=default_archive.idArchive, ps405Identification=admin.identification, access_level="admin"))

    if not db.query(HRDepartment).filter(HRDepartment.department_code == "DEP-ARCH").one_or_none():
        db.add(HRDepartment(department_code="DEP-ARCH", name="Archivo", responsible_identification=admin.identification, status="active"))
    if not db.query(HRPosition).filter(HRPosition.position_code == "CAR-ADMIN").one_or_none():
        db.add(
            HRPosition(
                position_code="CAR-ADMIN",
                name="Administrador",
                level="direccion",
                department="Archivo",
                description="Cargo inicial para administracion de AMBAR",
                suggested_permissions={"items": ["users.manage", "archive.manage"]},
                required_documents={"items": []},
                status="active",
            )
        )
    dependency = db.query(TrdDependency).filter(TrdDependency.code == "GENERAL").one_or_none()
    if not dependency:
        dependency = TrdDependency(code="GENERAL", name="General", description="Dependencia documental inicial", status="active")
        db.add(dependency)
        db.flush()

    if not db.query(TrdSeries).first():
        series = TrdSeries(code="ADM-001", name="Gestion Administrativa", description="Serie documental inicial", ps608IdDependency=dependency.idDependency, status="active")
        db.add(series)
        db.flush()
        subseries = TrdSubseries(ps610IdSeries=series.idSeries, name="Contratos y soportes", retention_years=5, status="active")
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
    else:
        series = db.query(TrdSeries).order_by(TrdSeries.idSeries.asc()).first()
        subseries = db.query(TrdSubseries).order_by(TrdSubseries.idSubseries.asc()).first()
        if series and not series.ps608IdDependency:
            series.ps608IdDependency = dependency.idDependency

    if default_archive and not db.query(Expedient).filter(Expedient.expedient_code == "EXP-GEN-0001").one_or_none():
        expedient = Expedient(
            expedient_code="EXP-GEN-0001",
            expedient_name="Expediente General de Entrada",
            expedient_type="administrativo",
            ps930IdArchive=default_archive.idArchive,
            ps608IdDependency=series.ps608IdDependency if series else dependency.idDependency,
            ps610IdSeries=series.idSeries if series else None,
            ps612IdSubseries=subseries.idSubseries if subseries else None,
            responsible_identification=admin.identification,
            status="active",
            physical_location="Bandeja de clasificacion",
            metadata_json={"seed": True},
        )
        db.add(expedient)
        db.flush()
        db.add(
            Folder(
                folder_code="CARP-GEN-0001",
                folder_name="Carpeta General de Entrada",
                ps950IdExpedient=expedient.idExpedient,
                ps930IdArchive=default_archive.idArchive,
                physical_location="Bandeja de clasificacion",
                metadata_json={"seed": True},
            )
        )
    elif default_archive:
        expedient = db.query(Expedient).filter(Expedient.expedient_code == "EXP-GEN-0001").one_or_none()
        if expedient and (not expedient.ps610IdSeries or not expedient.ps612IdSubseries):
            expedient.ps610IdSeries = series.idSeries if series else expedient.ps610IdSeries
            expedient.ps612IdSubseries = subseries.idSubseries if subseries else expedient.ps612IdSubseries
            expedient.ps608IdDependency = series.ps608IdDependency if series and series.ps608IdDependency else expedient.ps608IdDependency
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
