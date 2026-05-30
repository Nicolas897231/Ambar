"""phase 2 document core

Revision ID: 202605280002
Revises: 202605280001
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202605280002"
down_revision: str | None = "202605280001"
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
    if _has_table(table) and not _has_index(table, index_name):
        op.create_index(index_name, table, columns)


def upgrade() -> None:
    if not _has_table("ps526_document_types"):
        op.create_table(
            "ps526_document_types",
            sa.Column("idDocumentType", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("type_code", sa.String(length=80), nullable=False, unique=True),
            sa.Column("name", sa.String(length=140), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("required_metadata", sa.JSON(), nullable=True),
            sa.Column("optional_metadata", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _has_table("ps528_document_metadata"):
        op.create_table(
            "ps528_document_metadata",
            sa.Column("idMetadata", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("ps520IdDocument", sa.Integer(), sa.ForeignKey("ps520_documents.idDocument"), nullable=False),
            sa.Column("metadata_key", sa.String(length=120), nullable=False),
            sa.Column("metadata_value", sa.Text(), nullable=True),
            sa.Column("required", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("ps520IdDocument", "metadata_key"),
        )

    _add_column_if_missing("ps522_document_files", sa.Column("version", sa.Integer(), nullable=True))
    _add_column_if_missing("ps522_document_files", sa.Column("uploaded_by", sa.String(length=40), sa.ForeignKey("ps405_users.identification"), nullable=True))
    _add_column_if_missing("ps522_document_files", sa.Column("trace_id", sa.String(length=120), nullable=True))

    _create_index_if_missing("ps526_document_types", "ix_document_types_status", ["status"])
    _create_index_if_missing("ps528_document_metadata", "ix_document_metadata_document", ["ps520IdDocument"])
    _create_index_if_missing("ps520_documents", "ix_documents_documental_context", ["ps930IdArchive", "ps950IdExpedient", "ps952IdFolder", "ps612IdSubseries"])


def downgrade() -> None:
    for table, index_name in [
        ("ps520_documents", "ix_documents_documental_context"),
        ("ps528_document_metadata", "ix_document_metadata_document"),
        ("ps526_document_types", "ix_document_types_status"),
    ]:
        if _has_index(table, index_name):
            op.drop_index(index_name, table_name=table)
    for column in ["trace_id", "uploaded_by", "version"]:
        if _has_column("ps522_document_files", column):
            op.drop_column("ps522_document_files", column)
    if _has_table("ps528_document_metadata"):
        op.drop_table("ps528_document_metadata")
    if _has_table("ps526_document_types"):
        op.drop_table("ps526_document_types")
