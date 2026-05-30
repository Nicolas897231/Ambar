"""restore hr positions table

Revision ID: 202605300001
Revises: 202605290003
Create Date: 2026-05-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202605300001"
down_revision: str | None = "202605290003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _inspector():
    return inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return table in _inspector().get_table_names()


def _has_index(table: str, index_name: str) -> bool:
    if not _has_table(table):
        return False
    return index_name in {item["name"] for item in _inspector().get_indexes(table)}


def upgrade() -> None:
    if not _has_table("ps1008_hr_positions"):
        op.create_table(
            "ps1008_hr_positions",
            sa.Column("idPosition", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("position_code", sa.String(length=40), nullable=False, unique=True),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("level", sa.String(length=80), nullable=False, server_default="operativo"),
            sa.Column("department", sa.String(length=120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("suggested_permissions", sa.JSON(), nullable=True),
            sa.Column("required_documents", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=True, server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        )
    if not _has_index("ps1008_hr_positions", "ix_hr_positions_status"):
        op.create_index("ix_hr_positions_status", "ps1008_hr_positions", ["status"])


def downgrade() -> None:
    if _has_index("ps1008_hr_positions", "ix_hr_positions_status"):
        op.drop_index("ix_hr_positions_status", table_name="ps1008_hr_positions")
