"""enterprise performance indexes for operational workloads

Revision ID: 202607090001
Revises: 202606130003
Create Date: 2026-07-09
"""
from alembic import op
from sqlalchemy import text

revision = "202607090001"
down_revision = "202606130003"
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return conn.execute(text(f"SHOW TABLES LIKE '{table}'")).rowcount > 0


def _has_column(conn, table: str, column: str) -> bool:
    return conn.execute(text(f"SHOW COLUMNS FROM `{table}` LIKE '{column}'")).rowcount > 0


def _has_index(conn, table: str, index_name: str) -> bool:
    return conn.execute(text(f"SHOW INDEX FROM `{table}` WHERE Key_name = '{index_name}'")).rowcount > 0


def _create_index(conn, table: str, name: str, columns: str, required: list[str]) -> None:
    if not _table_exists(conn, table):
        return
    if not all(_has_column(conn, table, column) for column in required):
        return
    if not _has_index(conn, table, name):
        conn.execute(text(f"ALTER TABLE `{table}` ADD INDEX `{name}` ({columns})"))


def upgrade() -> None:
    conn = op.get_bind()
    indexes = [
        ("ps520_documents", "ix_documents_archive_expedient_status", "ps930IdArchive, ps950IdExpedient, status", ["ps930IdArchive", "ps950IdExpedient", "status"]),
        ("ps520_documents", "ix_documents_type_created", "document_type, created_at", ["document_type", "created_at"]),
        ("ps522_document_files", "ix_document_files_document_uploaded", "ps520IdDocument, uploaded_at", ["ps520IdDocument", "uploaded_at"]),
        ("ps528_document_metadata", "ix_document_metadata_key_value", "metadata_key, metadata_value(120)", ["metadata_key", "metadata_value"]),
        ("ps950_expedients", "ix_expedients_archive_status_created", "ps930IdArchive, status, created_at", ["ps930IdArchive", "status", "created_at"]),
        ("ps952_folders", "ix_folders_expedient_status", "ps950IdExpedient, status", ["ps950IdExpedient", "status"]),
        ("ps936_physical_boxes", "ix_boxes_archive_status", "ps930IdArchive, status", ["ps930IdArchive", "status"]),
        ("ps958_document_loans", "ix_loans_archive_status_due", "ps930IdArchive, status, due_at", ["ps930IdArchive", "status", "due_at"]),
        ("ps960_kardex_movements", "ix_kardex_archives_created", "ps930OriginArchiveId, ps930DestinationArchiveId, created_at", ["ps930OriginArchiveId", "ps930DestinationArchiveId", "created_at"]),
        ("ps960_kardex_movements", "ix_kardex_entity_created", "entity_type, entity_id, created_at", ["entity_type", "entity_id", "created_at"]),
        ("ps1040_notifications", "ix_notifications_user_status_created", "ps405Identification, status, created_at", ["ps405Identification", "status", "created_at"]),
        ("ps916_workflow_tasks", "ix_tasks_user_status_due", "ps405Identification, status, due_date", ["ps405Identification", "status", "due_date"]),
        ("ps1070_transfer_batches", "ix_batches_status_created", "status, created_at", ["status", "created_at"]),
        ("ps1073_transfer_batch_items", "ix_batch_items_batch_status", "ps1070IdBatch, status", ["ps1070IdBatch", "status"]),
        ("ps820_audit_log", "ix_audit_result_severity_created", "result, severity, created_at", ["result", "severity", "created_at"]),
        ("ps1010_employees", "ix_employees_company_status", "company_id, status", ["company_id", "status"]),
    ]
    for table, name, columns, required in indexes:
        _create_index(conn, table, name, columns, required)


def downgrade() -> None:
    conn = op.get_bind()
    indexes = [
        ("ps520_documents", "ix_documents_archive_expedient_status"),
        ("ps520_documents", "ix_documents_type_created"),
        ("ps522_document_files", "ix_document_files_document_uploaded"),
        ("ps528_document_metadata", "ix_document_metadata_key_value"),
        ("ps950_expedients", "ix_expedients_archive_status_created"),
        ("ps952_folders", "ix_folders_expedient_status"),
        ("ps936_physical_boxes", "ix_boxes_archive_status"),
        ("ps958_document_loans", "ix_loans_archive_status_due"),
        ("ps960_kardex_movements", "ix_kardex_archives_created"),
        ("ps960_kardex_movements", "ix_kardex_entity_created"),
        ("ps1040_notifications", "ix_notifications_user_status_created"),
        ("ps916_workflow_tasks", "ix_tasks_user_status_due"),
        ("ps1070_transfer_batches", "ix_batches_status_created"),
        ("ps1073_transfer_batch_items", "ix_batch_items_batch_status"),
        ("ps820_audit_log", "ix_audit_result_severity_created"),
        ("ps1010_employees", "ix_employees_company_status"),
    ]
    for table, name in indexes:
        if _table_exists(conn, table) and _has_index(conn, table, name):
            conn.execute(text(f"ALTER TABLE `{table}` DROP INDEX `{name}`"))
