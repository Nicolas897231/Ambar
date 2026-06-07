"""trd dependencies and lifecycle

Revision ID: 202606030002
Revises: 202606030001
Create Date: 2026-06-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202606030002"
down_revision: str | None = "202606030001"
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
    if not _has_table("ps608_trd_dependencies"):
        op.create_table(
            "ps608_trd_dependencies",
            sa.Column("idDependency", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("code", sa.String(length=40), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint("idDependency"),
            sa.UniqueConstraint("code"),
        )
    _create_index_if_missing("ps608_trd_dependencies", "ix_ps608_trd_dependencies_status", ["status"])

    _add_column_if_missing("ps610_trd_series", sa.Column("ps608IdDependency", sa.Integer(), nullable=True))
    _add_column_if_missing("ps610_trd_series", sa.Column("status", sa.String(length=40), nullable=False, server_default="active"))
    _create_index_if_missing("ps610_trd_series", "ix_ps610_trd_series_ps608IdDependency", ["ps608IdDependency"])
    _create_index_if_missing("ps610_trd_series", "ix_ps610_trd_series_status", ["status"])

    _add_column_if_missing("ps612_trd_subseries", sa.Column("status", sa.String(length=40), nullable=False, server_default="active"))
    _create_index_if_missing("ps612_trd_subseries", "ix_ps612_trd_subseries_status", ["status"])

    _add_column_if_missing("ps614_trd_disposition", sa.Column("procedure", sa.Text(), nullable=True))

    _add_column_if_missing("ps950_expedients", sa.Column("ps608IdDependency", sa.Integer(), nullable=True))
    _create_index_if_missing("ps950_expedients", "ix_ps950_expedients_ps608IdDependency", ["ps608IdDependency"])


def downgrade() -> None:
    pass
