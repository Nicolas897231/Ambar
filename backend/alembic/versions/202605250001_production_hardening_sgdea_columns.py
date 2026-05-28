"""production hardening sgdea columns

Revision ID: 202605250001
Revises: 202605170001
Create Date: 2026-05-25
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202605250001"
down_revision: str | None = "202605170001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _inspector():
    return inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return table in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    if not _has_table(table):
        return False
    return column in {item["name"] for item in _inspector().get_columns(table)}


def _has_index(table: str, index_name: str) -> bool:
    if not _has_table(table):
        return False
    return index_name in {item["name"] for item in _inspector().get_indexes(table)}


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if _has_table(table) and not _has_column(table, column.name):
        op.add_column(table, column)


def _create_index_if_missing(table: str, index_name: str, columns: list[str]) -> None:
    if _has_table(table) and not _has_index(table, index_name) and all(_has_column(table, column) for column in columns):
        op.create_index(index_name, table, columns)


def upgrade() -> None:
    if not _has_table("ps1008_hr_positions"):
        op.create_table(
            "ps1008_hr_positions",
            sa.Column("idPosition", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("position_code", sa.String(length=40), nullable=False, unique=True),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("level", sa.String(length=80), nullable=False),
            sa.Column("department", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("suggested_permissions", sa.JSON(), nullable=True),
            sa.Column("required_documents", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        )

    document_columns = [
        sa.Column("ps930IdArchive", sa.Integer(), nullable=True),
        sa.Column("ps950IdExpedient", sa.Integer(), nullable=True),
        sa.Column("ps952IdFolder", sa.Integer(), nullable=True),
        sa.Column("folio_start", sa.Integer(), nullable=True),
        sa.Column("folio_end", sa.Integer(), nullable=True),
        sa.Column("folio_total", sa.Integer(), nullable=True),
        sa.Column("physical_location", sa.String(length=255), nullable=True),
    ]
    for column in document_columns:
        _add_column_if_missing("ps520_documents", column)

    for column in [
        sa.Column("ps930OriginArchiveId", sa.Integer(), nullable=True),
        sa.Column("ps930DestinationArchiveId", sa.Integer(), nullable=True),
    ]:
        _add_column_if_missing("ps1070_transfer_batches", column)

    transfer_item_columns = [
        sa.Column("expected_quantity", sa.Integer(), nullable=True),
        sa.Column("received_quantity", sa.Integer(), nullable=True),
        sa.Column("expected_folios", sa.Integer(), nullable=True),
        sa.Column("received_folios", sa.Integer(), nullable=True),
        sa.Column("rejection_reason", sa.String(length=80), nullable=True),
        sa.Column("observation", sa.Text(), nullable=True),
        sa.Column("evidence_url", sa.String(length=500), nullable=True),
        sa.Column("reviewed_by", sa.String(length=40), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("ps930OriginArchiveId", sa.Integer(), nullable=True),
        sa.Column("ps930DestinationArchiveId", sa.Integer(), nullable=True),
    ]
    for column in transfer_item_columns:
        _add_column_if_missing("ps1073_transfer_batch_items", column)

    kardex_columns = [
        sa.Column("movement_code", sa.String(length=80), nullable=True),
        sa.Column("related_document_id", sa.Integer(), nullable=True),
        sa.Column("related_folder_id", sa.Integer(), nullable=True),
        sa.Column("related_expedient_id", sa.Integer(), nullable=True),
        sa.Column("related_box_id", sa.Integer(), nullable=True),
        sa.Column("related_transfer_id", sa.Integer(), nullable=True),
        sa.Column("related_loan_id", sa.Integer(), nullable=True),
        sa.Column("origin_location_id", sa.Integer(), nullable=True),
        sa.Column("destination_location_id", sa.Integer(), nullable=True),
        sa.Column("previous_status", sa.String(length=40), nullable=True),
        sa.Column("evidence_url", sa.String(length=500), nullable=True),
        sa.Column("ip_address", sa.String(length=80), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
    ]
    for column in kardex_columns:
        _add_column_if_missing("ps960_kardex_movements", column)

    audit_columns = [
        sa.Column("ps930IdArchive", sa.Integer(), nullable=True),
        sa.Column("entity_label", sa.String(length=255), nullable=True),
        sa.Column("result", sa.String(length=40), nullable=True),
        sa.Column("severity", sa.String(length=40), nullable=True),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("request_id", sa.String(length=120), nullable=True),
    ]
    for column in audit_columns:
        _add_column_if_missing("ps820_audit_log", column)

    notification_columns = [
        sa.Column("ps930IdArchive", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=True),
        sa.Column("priority", sa.String(length=40), nullable=True),
        sa.Column("notification_type", sa.String(length=80), nullable=True),
        sa.Column("related_entity_type", sa.String(length=80), nullable=True),
        sa.Column("related_entity_id", sa.String(length=80), nullable=True),
        sa.Column("action_label", sa.String(length=80), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    ]
    for column in notification_columns:
        _add_column_if_missing("ps1040_notifications", column)

    task_columns = [
        sa.Column("ps930IdArchive", sa.Integer(), nullable=True),
        sa.Column("module", sa.String(length=80), nullable=True),
        sa.Column("related_entity_type", sa.String(length=80), nullable=True),
        sa.Column("related_entity_id", sa.String(length=80), nullable=True),
        sa.Column("priority", sa.String(length=40), nullable=True),
        sa.Column("completed_by", sa.String(length=40), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("action_url", sa.String(length=255), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
    ]
    for column in task_columns:
        _add_column_if_missing("ps916_workflow_tasks", column)

    _create_index_if_missing("ps820_audit_log", "ix_audit_archive_created", ["ps930IdArchive", "created_at"])
    _create_index_if_missing("ps820_audit_log", "ix_audit_entity", ["entity", "entity_id"])
    _create_index_if_missing("ps820_audit_log", "ix_audit_result_severity", ["result", "severity"])
    _create_index_if_missing("ps960_kardex_movements", "ix_kardex_entity", ["entity_type", "entity_id"])
    _create_index_if_missing("ps960_kardex_movements", "ix_kardex_transfer", ["related_transfer_id"])
    _create_index_if_missing("ps1040_notifications", "ix_notifications_user_status", ["ps405Identification", "status"])
    _create_index_if_missing("ps916_workflow_tasks", "ix_tasks_assignee_status", ["ps405Identification", "status"])
    _create_index_if_missing("ps1008_hr_positions", "ix_hr_positions_status", ["status"])


def downgrade() -> None:
    for table, index_name in [
        ("ps1008_hr_positions", "ix_hr_positions_status"),
        ("ps916_workflow_tasks", "ix_tasks_assignee_status"),
        ("ps1040_notifications", "ix_notifications_user_status"),
        ("ps960_kardex_movements", "ix_kardex_transfer"),
        ("ps960_kardex_movements", "ix_kardex_entity"),
        ("ps820_audit_log", "ix_audit_result_severity"),
        ("ps820_audit_log", "ix_audit_entity"),
        ("ps820_audit_log", "ix_audit_archive_created"),
    ]:
        if _has_index(table, index_name):
            op.drop_index(index_name, table_name=table)
    if _has_table("ps1008_hr_positions"):
        op.drop_table("ps1008_hr_positions")
