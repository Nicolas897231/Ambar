"""physical topography phase 3

Revision ID: 202606030001
Revises: 202606020002
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202606030001"
down_revision: str | None = "202606020002"
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
    if _has_table("ps934_shelves") and not _has_column("ps934_shelves", "aisle"):
        op.add_column("ps934_shelves", sa.Column("aisle", sa.String(length=80), nullable=True))
    if _has_table("ps934_shelves") and not _has_index("ps934_shelves", "ix_ps934_shelves_topography"):
        op.create_index("ix_ps934_shelves_topography", "ps934_shelves", ["ps930IdArchive", "aisle", "shelf_code", "module", "bay"])


def downgrade() -> None:
    if _has_index("ps934_shelves", "ix_ps934_shelves_topography"):
        op.drop_index("ix_ps934_shelves_topography", table_name="ps934_shelves")
    if _has_table("ps934_shelves") and _has_column("ps934_shelves", "aisle"):
        op.drop_column("ps934_shelves", "aisle")
