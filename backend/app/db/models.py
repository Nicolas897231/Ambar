from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
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
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    document: Mapped[Document] = relationship(back_populates="files")


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
    action: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity: Mapped[str | None] = mapped_column(String(120))
    entity_id: Mapped[str | None] = mapped_column(String(80))
    old_values: Mapped[dict | None] = mapped_column(JSON)
    new_values: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(80))
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
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    evidence: Mapped[dict | None] = mapped_column(JSON)
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
    module: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    action_url: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


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
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TransferBatchDocument(Base):
    __tablename__ = "ps1072_transfer_batch_documents"
    __table_args__ = (UniqueConstraint("ps1070IdBatch", "ps520IdDocument"),)

    idBatchDocument: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ps1070IdBatch: Mapped[int] = mapped_column(ForeignKey("ps1070_transfer_batches.idBatch"), nullable=False)
    ps520IdDocument: Mapped[int] = mapped_column(ForeignKey("ps520_documents.idDocument"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True)


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