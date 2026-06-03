"""document intelligence phase 1

Revision ID: 202606020001
Revises: 202605300001
Create Date: 2026-06-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202606020001"
down_revision: str | None = "202605300001"
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
    _add_column_if_missing("ps526_document_types", sa.Column("ps610IdSeries", sa.Integer(), nullable=True))
    _add_column_if_missing("ps526_document_types", sa.Column("ps612IdSubseries", sa.Integer(), nullable=True))
    _add_column_if_missing("ps526_document_types", sa.Column("sector", sa.String(length=80), nullable=True))
    _add_column_if_missing("ps526_document_types", sa.Column("validation_schema", sa.JSON(), nullable=True))
    _create_index_if_missing("ps526_document_types", "ix_ps526_document_types_ps610IdSeries", ["ps610IdSeries"])
    _create_index_if_missing("ps526_document_types", "ix_ps526_document_types_ps612IdSubseries", ["ps612IdSubseries"])
    _create_index_if_missing("ps526_document_types", "ix_ps526_document_types_sector", ["sector"])
    _create_index_if_missing("ps528_document_metadata", "ix_document_metadata_key_value", ["metadata_key", "metadata_value"])


def downgrade() -> None:
    for index_name, table in [
        ("ix_document_metadata_key_value", "ps528_document_metadata"),
        ("ix_ps526_document_types_sector", "ps526_document_types"),
        ("ix_ps526_document_types_ps612IdSubseries", "ps526_document_types"),
        ("ix_ps526_document_types_ps610IdSeries", "ps526_document_types"),
    ]:
        if _has_index(table, index_name):
            op.drop_index(index_name, table_name=table)
