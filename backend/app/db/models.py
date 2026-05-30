from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())


class User(Base, TimestampMixin):
    __tablename__ = "ps405_users"

    identification: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="active", index=True)
    company_id: Mapped[str] = mapped_column(String(40), default="default", index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("ps700_locations.idLocation"))
    phone: Mapped[str | None] = mapped_column(String(20))
    position_name: Mapped[str | None] = mapped_column(String(120))
    department_name: Mapped[str | None] = mapped_column(String(120))
    auth_method: Mapped[str] = mapped_column(String(40), default="temporary_password")
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(64))
    mechanical_signature_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    digital_signature_ready: Mapped[bool] = mapped_column(Boolean, default=False)
    access_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    roles: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Role(Base):
    __tablename__ = "ps407_roles"

    idRole: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    role_name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)

    permissions: Mapped[list["RolePermission"]] = relationship(back_populates="role", cascade="all, delete-orphan")


class Permission(Base):
    __tablename__ = "ps409_permissions"

    idPermission: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    permission_key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)


class RolePermission(Base):
    __tablename__ = "ps411_role_permissions"
    __table_args__ = (UniqueConstraint("ps407IdRole", "ps409IdPermission"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps407IdRole: Mapped[int] = mapped_column(ForeignKey("ps407_roles.idRole"), nullable=False)
    ps409IdPermission: Mapped[int] = mapped_column(ForeignKey("ps409_permissions.idPermission"), nullable=False)

    role: Mapped[Role] = relationship(back_populates="permissions")
    permission: Mapped[Permission] = relationship()


class UserRole(Base):
    __tablename__ = "ps413_user_roles"
    __table_args__ = (UniqueConstraint("ps405Identification", "ps407IdRole"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    ps407IdRole: Mapped[int] = mapped_column(ForeignKey("ps407_roles.idRole"), nullable=False)

    user: Mapped[User] = relationship(back_populates="roles")
    role: Mapped[Role] = relationship()


class RefreshSession(Base):
    __tablename__ = "ps415_refresh_sessions"

    idSession: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    refresh_jti: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(80))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Document(Base, TimestampMixin):
    __tablename__ = "ps520_documents"

    idDocument: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_name: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    document_type: Mapped[str] = mapped_column(String(80), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="created", index=True)
    company_id: Mapped[str] = mapped_column(String(40), default="default", index=True)
    location_id: Mapped[int | None] = mapped_column(ForeignKey("ps700_locations.idLocation"))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    ps612IdSubseries: Mapped[int | None] = mapped_column(ForeignKey("ps612_trd_subseries.idSubseries"))
    ps930IdArchive: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"), index=True)
    ps950IdExpedient: Mapped[int | None] = mapped_column(ForeignKey("ps950_expedients.idExpedient"), index=True)
    ps952IdFolder: Mapped[int | None] = mapped_column(ForeignKey("ps952_folders.idFolder"), index=True)
    folio_start: Mapped[int | None] = mapped_column(Integer)
    folio_end: Mapped[int | None] = mapped_column(Integer)
    folio_total: Mapped[int | None] = mapped_column(Integer)
    physical_location: Mapped[str | None] = mapped_column(String(255))

    files: Mapped[list["DocumentFile"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class DocumentFile(Base):
    __tablename__ = "ps522_document_files"

    idFile: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    checksum: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    uploaded_by: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    trace_id: Mapped[str | None] = mapped_column(String(120))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped[Document] = relationship(back_populates="files")


class DocumentType(Base, TimestampMixin):
    __tablename__ = "ps526_document_types"

    idDocumentType: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type_code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    required_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    optional_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)


class DocumentMetadata(Base, TimestampMixin):
    __tablename__ = "ps528_document_metadata"
    __table_args__ = (UniqueConstraint("ps520IdDocument", "metadata_key"),)

    idMetadata: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    metadata_key: Mapped[str] = mapped_column(String(120), nullable=False)
    metadata_value: Mapped[str | None] = mapped_column(Text)
    required: Mapped[bool] = mapped_column(Boolean, default=False)


class DocumentHistory(Base):
    __tablename__ = "ps524_document_history"

    idHistory: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    action_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class TrdSeries(Base):
    __tablename__ = "ps610_trd_series"

    idSeries: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class TrdSubseries(Base):
    __tablename__ = "ps612_trd_subseries"

    idSubseries: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps610IdSeries: Mapped[int] = mapped_column(ForeignKey("ps610_trd_series.idSeries"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    retention_years: Mapped[int] = mapped_column(Integer, nullable=False)
    series: Mapped[TrdSeries] = relationship()


class TrdDisposition(Base):
    __tablename__ = "ps614_trd_disposition"

    idDisposition: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps612IdSubseries: Mapped[int] = mapped_column(ForeignKey("ps612_trd_subseries.idSubseries"), nullable=False)
    archive_management: Mapped[int] = mapped_column(Integer, nullable=False)
    archive_central: Mapped[int] = mapped_column(Integer, nullable=False)
    final_action: Mapped[str] = mapped_column(String(120), nullable=False)
    subseries: Mapped[TrdSubseries] = relationship()


class Location(Base):
    __tablename__ = "ps700_locations"

    idLocation: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    location_name: Mapped[str] = mapped_column(String(160), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255))
    company_id: Mapped[str] = mapped_column(String(40), default="default", index=True)


class DocumentTransfer(Base):
    __tablename__ = "ps702_document_transfers"

    idTransfer: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    origin_location: Mapped[int] = mapped_column(ForeignKey("ps700_locations.idLocation"), nullable=False)
    destination_location: Mapped[int] = mapped_column(ForeignKey("ps700_locations.idLocation"), nullable=False)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    transfer_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)


class TransferLog(Base):
    __tablename__ = "ps704_transfer_log"

    idTransferLog: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps702IdTransfer: Mapped[int] = mapped_column(ForeignKey("ps702_document_transfers.idTransfer"), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    action_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    notes: Mapped[str | None] = mapped_column(Text)


class AuditLog(Base):
    __tablename__ = "ps820_audit_log"

    idAudit: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps405Identification: Mapped[str | None] = mapped_column(String(40), index=True)
    ps930IdArchive: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"), index=True)
    action: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity: Mapped[str | None] = mapped_column(String(120))
    entity_id: Mapped[str | None] = mapped_column(String(80))
    entity_label: Mapped[str | None] = mapped_column(String(255))
    result: Mapped[str] = mapped_column(String(40), default="success", index=True)
    severity: Mapped[str] = mapped_column(String(40), default="info", index=True)
    old_values: Mapped[dict | None] = mapped_column(JSON)
    new_values: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(80))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    request_id: Mapped[str | None] = mapped_column(String(120), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "ps840_notifications"

    idNotification: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(40), default="in_app")
    read_status: Mapped[bool] = mapped_column(Boolean, default=False)
    action_url: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Workflow(Base):
    __tablename__ = "ps910_workflows"

    idWorkflow: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class WorkflowStep(Base):
    __tablename__ = "ps912_workflow_steps"
    __table_args__ = (UniqueConstraint("ps910IdWorkflow", "step_order"),)

    idStep: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps910IdWorkflow: Mapped[int] = mapped_column(ForeignKey("ps910_workflows.idWorkflow"), nullable=False)
    step_name: Mapped[str] = mapped_column(String(160), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    assigned_role: Mapped[str] = mapped_column(String(80), nullable=False)
    sla_hours: Mapped[int] = mapped_column(Integer, default=24)
    workflow: Mapped[Workflow] = relationship()


class WorkflowInstance(Base):
    __tablename__ = "ps914_workflow_instances"

    idInstance: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps910IdWorkflow: Mapped[int] = mapped_column(ForeignKey("ps910_workflows.idWorkflow"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    workflow: Mapped[Workflow] = relationship()


class WorkflowTask(Base):
    __tablename__ = "ps916_workflow_tasks"

    idTask: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps914IdInstance: Mapped[int] = mapped_column(ForeignKey("ps914_workflow_instances.idInstance"), nullable=False)
    task_name: Mapped[str] = mapped_column(String(160), nullable=False)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    ps930IdArchive: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"), index=True)
    module: Mapped[str | None] = mapped_column(String(80), index=True)
    related_entity_type: Mapped[str | None] = mapped_column(String(80), index=True)
    related_entity_id: Mapped[str | None] = mapped_column(String(80), index=True)
    priority: Mapped[str] = mapped_column(String(40), default="normal", index=True)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    action_url: Mapped[str | None] = mapped_column(String(255))
    evidence: Mapped[dict | None] = mapped_column(JSON)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    instance: Mapped[WorkflowInstance] = relationship()


class Employee(Base):
    __tablename__ = "ps1010_employees"

    identification: Mapped[str] = mapped_column(String(40), primary_key=True)
    employee_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    position: Mapped[str] = mapped_column(String(120), nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    hire_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    company_id: Mapped[str] = mapped_column(String(40), default="default", index=True)


class HRPosition(Base):
    __tablename__ = "ps1008_hr_positions"

    idPosition: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    level: Mapped[str] = mapped_column(String(80), default="operativo")
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    suggested_permissions: Mapped[dict] = mapped_column(JSON, default=dict)
    required_documents: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HRDepartment(Base, TimestampMixin):
    __tablename__ = "ps1006_hr_departments"

    idDepartment: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("ps1006_hr_departments.idDepartment"))
    responsible_identification: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)


class HRCandidate(Base, TimestampMixin):
    __tablename__ = "ps1004_hr_candidates"

    idCandidate: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    candidate_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(80))
    position_applied: Mapped[str] = mapped_column(String(120), nullable=False)
    department: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="postulado", index=True)
    resume_document_id: Mapped[int | None] = mapped_column(ForeignKey("ps520_documents.idDocument"))
    observations: Mapped[dict | None] = mapped_column(JSON)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    hired_employee_id: Mapped[str | None] = mapped_column(ForeignKey("ps1010_employees.identification"))


class EmployeeFile(Base):
    __tablename__ = "ps1012_employee_files"
    __table_args__ = (UniqueConstraint("ps1010Identification", "file_type"),)

    idEmployeeFile: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1010Identification: Mapped[str] = mapped_column(ForeignKey("ps1010_employees.identification"), nullable=False)
    file_type: Mapped[str] = mapped_column(String(80), nullable=False)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    upload_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    employee: Mapped[Employee] = relationship()


class EmployeeContract(Base):
    __tablename__ = "ps1014_employee_contracts"

    idContract: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1010Identification: Mapped[str] = mapped_column(ForeignKey("ps1010_employees.identification"), nullable=False)
    contract_type: Mapped[str] = mapped_column(String(80), nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    employee: Mapped[Employee] = relationship()


class EmployeeIncident(Base):
    __tablename__ = "ps1016_employee_incidents"

    idIncident: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1010Identification: Mapped[str] = mapped_column(ForeignKey("ps1010_employees.identification"), nullable=False)
    incident_type: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    employee: Mapped[Employee] = relationship()


class AdvancedNotification(Base):
    __tablename__ = "ps1040_notifications"

    idNotification: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    ps930IdArchive: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"), index=True)
    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    title: Mapped[str | None] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    priority: Mapped[str] = mapped_column(String(40), default="normal", index=True)
    notification_type: Mapped[str | None] = mapped_column(String(80), index=True)
    related_entity_type: Mapped[str | None] = mapped_column(String(80), index=True)
    related_entity_id: Mapped[str | None] = mapped_column(String(80), index=True)
    action_label: Mapped[str | None] = mapped_column(String(80))
    action_url: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())


class NotificationDeliveryLog(Base):
    __tablename__ = "ps1042_notification_logs"

    idLog: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1040IdNotification: Mapped[int] = mapped_column(ForeignKey("ps1040_notifications.idNotification"), nullable=False)
    delivery_channel: Mapped[str] = mapped_column(String(40), nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(40), nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TransferBatch(Base):
    __tablename__ = "ps1070_transfer_batches"

    idBatch: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    origin_location: Mapped[int] = mapped_column(ForeignKey("ps700_locations.idLocation"), nullable=False)
    destination_location: Mapped[int] = mapped_column(ForeignKey("ps700_locations.idLocation"), nullable=False)
    ps930OriginArchiveId: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"), index=True)
    ps930DestinationArchiveId: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"), index=True)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TransferBatchDocument(Base):
    __tablename__ = "ps1072_transfer_batch_documents"
    __table_args__ = (UniqueConstraint("ps1070IdBatch", "ps520IdDocument"),)

    idBatchDocument: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1070IdBatch: Mapped[int] = mapped_column(ForeignKey("ps1070_transfer_batches.idBatch"), nullable=False)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)


class TransferBatchItem(Base):
    __tablename__ = "ps1073_transfer_batch_items"
    __table_args__ = (UniqueConstraint("ps1070IdBatch", "entity_type", "entity_id"),)

    idBatchItem: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1070IdBatch: Mapped[int] = mapped_column(ForeignKey("ps1070_transfer_batches.idBatch"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    expected_quantity: Mapped[int | None] = mapped_column(Integer)
    received_quantity: Mapped[int | None] = mapped_column(Integer)
    expected_folios: Mapped[int | None] = mapped_column(Integer)
    received_folios: Mapped[int | None] = mapped_column(Integer)
    folio_total: Mapped[int] = mapped_column(Integer, default=0)
    rejection_reason: Mapped[str | None] = mapped_column(String(80))
    observation: Mapped[str | None] = mapped_column(Text)
    evidence_url: Mapped[str | None] = mapped_column(String(500))
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ps930OriginArchiveId: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"), index=True)
    ps930DestinationArchiveId: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"), index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class TransferEvidence(Base):
    __tablename__ = "ps1074_transfer_evidences"

    idEvidence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1070IdBatch: Mapped[int] = mapped_column(ForeignKey("ps1070_transfer_batches.idBatch"), nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(80), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReportJob(Base):
    __tablename__ = "ps1100_report_jobs"

    idJob: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="queued", index=True)
    generated_file: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

class OcrJob(Base):
    __tablename__ = "ps1200_ocr_jobs"

    idJob: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="queued", index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confidence_avg: Mapped[int | None] = mapped_column(Integer)
    fingerprint: Mapped[str | None] = mapped_column(String(128), index=True)


class OcrResult(Base):
    __tablename__ = "ps1202_ocr_results"

    idResult: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1200IdJob: Mapped[int] = mapped_column(ForeignKey("ps1200_ocr_jobs.idJob"), nullable=False)
    extracted_text: Mapped[str] = mapped_column(Text, nullable=False)
    extracted_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    ocr_engine: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SignatureRequest(Base):
    __tablename__ = "ps1240_signature_requests"

    idRequest: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    requested_by: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    signer_identification: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    document_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SignatureEvent(Base):
    __tablename__ = "ps1242_signature_events"

    idEvent: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1240IdRequest: Mapped[int] = mapped_column(ForeignKey("ps1240_signature_requests.idRequest"), nullable=False)
    signer_identification: Mapped[str] = mapped_column(String(40), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(80))
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    evidence_data: Mapped[dict] = mapped_column(JSON, default=dict)


class Integration(Base):
    __tablename__ = "ps1280_integrations"

    idIntegration: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    integration_name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    integration_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    config_data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IntegrationLog(Base):
    __tablename__ = "ps1282_integration_logs"

    idLog: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1280IdIntegration: Mapped[int] = mapped_column(ForeignKey("ps1280_integrations.idIntegration"), nullable=False)
    request_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    response_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WebhookEndpoint(Base):
    __tablename__ = "ps1300_webhook_endpoints"

    idEndpoint: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    endpoint_name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    target_url: Mapped[str] = mapped_column(String(500), nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    secret_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WebhookDelivery(Base):
    __tablename__ = "ps1302_webhook_deliveries"

    idDelivery: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1300IdEndpoint: Mapped[int] = mapped_column(ForeignKey("ps1300_webhook_endpoints.idEndpoint"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    delivery_status: Mapped[str] = mapped_column(String(40), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    signature: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BiSnapshot(Base):
    __tablename__ = "ps1320_bi_snapshots"

    idSnapshot: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_type: Mapped[str] = mapped_column(String(80), nullable=False)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DataWarehouseFact(Base):
    __tablename__ = "ps1340_dw_facts"

    idFact: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fact_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    source_entity: Mapped[str] = mapped_column(String(120), nullable=False)
    source_id: Mapped[str] = mapped_column(String(80), nullable=False)
    measure_data: Mapped[dict] = mapped_column(JSON, default=dict)
    loaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
class Archive(Base, TimestampMixin):
    __tablename__ = "ps930_archives"

    idArchive: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    archive_code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    archive_name: Mapped[str] = mapped_column(String(180), nullable=False)
    archive_type: Mapped[str] = mapped_column(String(40), default="gestion", index=True)
    ps700IdLocation: Mapped[int | None] = mapped_column(ForeignKey("ps700_locations.idLocation"))
    description: Mapped[str | None] = mapped_column(Text)
    responsible_identification: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    custodian_identification: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    capacity_units: Mapped[int] = mapped_column(Integer, default=0)
    physical_location: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    box_count: Mapped[int] = mapped_column(Integer, default=0)
    expedient_count: Mapped[int] = mapped_column(Integer, default=0)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ArchiveUser(Base):
    __tablename__ = "ps932_archive_users"
    __table_args__ = (UniqueConstraint("ps930IdArchive", "ps405Identification"),)

    idArchiveUser: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps930IdArchive: Mapped[int] = mapped_column(ForeignKey("ps930_archives.idArchive"), nullable=False)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    access_level: Mapped[str] = mapped_column(String(40), default="read")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    archive: Mapped[Archive] = relationship()
    user: Mapped[User] = relationship()


class Shelf(Base, TimestampMixin):
    __tablename__ = "ps934_shelves"
    __table_args__ = (UniqueConstraint("ps930IdArchive", "shelf_code"),)

    idShelf: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps930IdArchive: Mapped[int] = mapped_column(ForeignKey("ps930_archives.idArchive"), nullable=False)
    shelf_code: Mapped[str] = mapped_column(String(60), nullable=False)
    shelf_name: Mapped[str] = mapped_column(String(160), nullable=False)
    floor: Mapped[str | None] = mapped_column(String(80))
    module: Mapped[str | None] = mapped_column(String(80))
    bay: Mapped[str | None] = mapped_column(String(80))
    capacity_boxes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    physical_location: Mapped[str | None] = mapped_column(String(255))

    archive: Mapped[Archive] = relationship()


class PhysicalBox(Base, TimestampMixin):
    __tablename__ = "ps936_physical_boxes"
    __table_args__ = (UniqueConstraint("ps930IdArchive", "box_code"),)

    idBox: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps930IdArchive: Mapped[int] = mapped_column(ForeignKey("ps930_archives.idArchive"), nullable=False)
    ps934IdShelf: Mapped[int | None] = mapped_column(ForeignKey("ps934_shelves.idShelf"))
    box_code: Mapped[str] = mapped_column(String(60), nullable=False)
    box_name: Mapped[str | None] = mapped_column(String(160))
    capacity_folders: Mapped[int] = mapped_column(Integer, default=0)
    current_folders: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)

    archive: Mapped[Archive] = relationship()
    shelf: Mapped[Shelf] = relationship()


class Expedient(Base, TimestampMixin):
    __tablename__ = "ps950_expedients"
    __table_args__ = (UniqueConstraint("ps930IdArchive", "expedient_code"),)

    idExpedient: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    expedient_code: Mapped[str] = mapped_column(String(80), nullable=False)
    expedient_name: Mapped[str] = mapped_column(String(220), nullable=False)
    expedient_type: Mapped[str] = mapped_column(String(80), default="administrativo", index=True)
    ps930IdArchive: Mapped[int] = mapped_column(ForeignKey("ps930_archives.idArchive"), nullable=False)
    ps610IdSeries: Mapped[int | None] = mapped_column(ForeignKey("ps610_trd_series.idSeries"))
    ps612IdSubseries: Mapped[int | None] = mapped_column(ForeignKey("ps612_trd_subseries.idSubseries"))
    responsible_identification: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    physical_location: Mapped[str | None] = mapped_column(String(255))
    digital_location: Mapped[str | None] = mapped_column(String(500))
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    folio_count: Mapped[int] = mapped_column(Integer, default=0)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)

    archive: Mapped[Archive] = relationship()
    series: Mapped[TrdSeries] = relationship()
    subseries: Mapped[TrdSubseries] = relationship()


class Folder(Base, TimestampMixin):
    __tablename__ = "ps952_folders"
    __table_args__ = (UniqueConstraint("ps950IdExpedient", "folder_code"),)

    idFolder: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    folder_code: Mapped[str] = mapped_column(String(80), nullable=False)
    folder_name: Mapped[str] = mapped_column(String(220), nullable=False)
    ps950IdExpedient: Mapped[int] = mapped_column(ForeignKey("ps950_expedients.idExpedient"), nullable=False)
    ps930IdArchive: Mapped[int] = mapped_column(ForeignKey("ps930_archives.idArchive"), nullable=False)
    ps936IdBox: Mapped[int | None] = mapped_column(ForeignKey("ps936_physical_boxes.idBox"))
    folio_count: Mapped[int] = mapped_column(Integer, default=0)
    document_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    physical_location: Mapped[str | None] = mapped_column(String(255))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)

    archive: Mapped[Archive] = relationship()
    expedient: Mapped[Expedient] = relationship()
    box: Mapped[PhysicalBox] = relationship()


class Foliation(Base, TimestampMixin):
    __tablename__ = "ps954_foliation"
    __table_args__ = (UniqueConstraint("ps520IdDocument", "folio_start", "folio_end"),)

    idFoliation: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    ps950IdExpedient: Mapped[int] = mapped_column(ForeignKey("ps950_expedients.idExpedient"), nullable=False)
    ps952IdFolder: Mapped[int] = mapped_column(ForeignKey("ps952_folders.idFolder"), nullable=False)
    folio_start: Mapped[int] = mapped_column(Integer, nullable=False)
    folio_end: Mapped[int] = mapped_column(Integer, nullable=False)
    folio_total: Mapped[int] = mapped_column(Integer, nullable=False)
    electronic_folios: Mapped[int] = mapped_column(Integer, default=0)
    annexes: Mapped[str | None] = mapped_column(Text)
    validation_status: Mapped[str] = mapped_column(String(40), default="valid", index=True)
    validation_notes: Mapped[str | None] = mapped_column(Text)


class InventoryFuid(Base, TimestampMixin):
    __tablename__ = "ps956_inventory_fuid"

    idFuid: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fuid_code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    ps930IdArchive: Mapped[int] = mapped_column(ForeignKey("ps930_archives.idArchive"), nullable=False)
    ps950IdExpedient: Mapped[int | None] = mapped_column(ForeignKey("ps950_expedients.idExpedient"))
    ps1070IdBatch: Mapped[int | None] = mapped_column(ForeignKey("ps1070_transfer_batches.idBatch"))
    support_type: Mapped[str] = mapped_column(String(40), default="hybrid")
    folio_total: Mapped[int] = mapped_column(Integer, default=0)
    location_summary: Mapped[str | None] = mapped_column(String(255))
    observations: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class DocumentLoan(Base, TimestampMixin):
    __tablename__ = "ps958_document_loans"

    idLoan: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(40), default="folder", index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    ps930IdArchive: Mapped[int] = mapped_column(ForeignKey("ps930_archives.idArchive"), nullable=False)
    requested_by: Mapped[str] = mapped_column(String(160), nullable=False)
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    evidence: Mapped[dict | None] = mapped_column(JSON)
    observations: Mapped[str | None] = mapped_column(Text)


class KardexMovement(Base, TimestampMixin):
    __tablename__ = "ps960_kardex_movements"

    idMovement: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    movement_code: Mapped[str | None] = mapped_column(String(80), unique=True)
    movement_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    related_document_id: Mapped[int | None] = mapped_column(Integer, index=True)
    related_folder_id: Mapped[int | None] = mapped_column(Integer, index=True)
    related_expedient_id: Mapped[int | None] = mapped_column(Integer, index=True)
    related_box_id: Mapped[int | None] = mapped_column(Integer, index=True)
    related_transfer_id: Mapped[int | None] = mapped_column(Integer, index=True)
    related_loan_id: Mapped[int | None] = mapped_column(Integer, index=True)
    ps930OriginArchiveId: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"))
    ps930DestinationArchiveId: Mapped[int | None] = mapped_column(ForeignKey("ps930_archives.idArchive"))
    origin_location_id: Mapped[int | None] = mapped_column(Integer)
    destination_location_id: Mapped[int | None] = mapped_column(Integer)
    ps405ActorIdentification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    custodian_from: Mapped[str | None] = mapped_column(String(160))
    custodian_to: Mapped[str | None] = mapped_column(String(160))
    previous_status: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    evidence_url: Mapped[str | None] = mapped_column(String(500))
    ip_address: Mapped[str | None] = mapped_column(String(80))
    user_agent: Mapped[str | None] = mapped_column(String(255))
    reason: Mapped[str | None] = mapped_column(Text)
    observations: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)

    origin_archive: Mapped[Archive] = relationship(foreign_keys=[ps930OriginArchiveId])
    destination_archive: Mapped[Archive] = relationship(foreign_keys=[ps930DestinationArchiveId])


class MovementTrace(Base):
    __tablename__ = "ps962_movement_traces"

    idTrace: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps960IdMovement: Mapped[int] = mapped_column(ForeignKey("ps960_kardex_movements.idMovement"), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    ps405Identification: Mapped[str] = mapped_column(ForeignKey("ps405_users.identification"), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(80))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    movement: Mapped[KardexMovement] = relationship()


class Custodianship(Base, TimestampMixin):
    __tablename__ = "ps964_custodianships"
    __table_args__ = (
        Index("ix_custodianships_entity_current", "entity_type", "entity_id", "is_current"),
        Index("ix_custodianships_archive_status", "ps930IdArchive", "status"),
    )

    idCustodianship: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    ps930IdArchive: Mapped[int] = mapped_column(ForeignKey("ps930_archives.idArchive"), nullable=False, index=True)
    custodian_identification: Mapped[str | None] = mapped_column(ForeignKey("ps405_users.identification"))
    current_location_path: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(40), default="active", index=True)
    source_module: Mapped[str | None] = mapped_column(String(80))
    related_movement_id: Mapped[int | None] = mapped_column(ForeignKey("ps960_kardex_movements.idMovement"))
    related_transfer_id: Mapped[int | None] = mapped_column(ForeignKey("ps1070_transfer_batches.idBatch"))
    related_loan_id: Mapped[int | None] = mapped_column(ForeignKey("ps958_document_loans.idLoan"))
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)

    archive: Mapped[Archive] = relationship()
