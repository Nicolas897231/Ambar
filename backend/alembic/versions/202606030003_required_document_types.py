"""required document types

Revision ID: 202606030003
Revises: 202606030002
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202606030003"
down_revision: str | None = "202606030002"
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


def upgrade() -> None:
    if _has_table("ps526_document_types") and not _has_column("ps526_document_types", "required_in_expedient"):
        op.add_column("ps526_document_types", sa.Column("required_in_expedient", sa.Boolean(), nullable=False, server_default=sa.text("1")))
    if _has_table("ps526_document_types") and not _has_index("ps526_document_types", "ix_ps526_document_types_required_in_expedient"):
        op.create_index("ix_ps526_document_types_required_in_expedient", "ps526_document_types", ["required_in_expedient"])


def downgrade() -> None:
    pass
