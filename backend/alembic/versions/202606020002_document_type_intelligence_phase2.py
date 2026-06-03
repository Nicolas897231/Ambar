"""document type intelligence phase 2

Revision ID: 202606020002
Revises: 202606020001
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202606020002"
down_revision: str | None = "202606020001"
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
    _add_column_if_missing("ps526_document_types", sa.Column("icon", sa.String(length=80), nullable=True))
    _add_column_if_missing("ps526_document_types", sa.Column("color", sa.String(length=40), nullable=True))
    _add_column_if_missing("ps526_document_types", sa.Column("template_sector", sa.String(length=80), nullable=True))
    _create_index_if_missing("ps526_document_types", "ix_ps526_document_types_template_sector", ["template_sector"])


def downgrade() -> None:
    if _has_index("ps526_document_types", "ix_ps526_document_types_template_sector"):
        op.drop_index("ix_ps526_document_types_template_sector", table_name="ps526_document_types")
