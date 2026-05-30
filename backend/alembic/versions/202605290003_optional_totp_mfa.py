"""optional totp mfa

Revision ID: 202605290003
Revises: 202605290002
Create Date: 2026-05-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202605290003"
down_revision: str | None = "202605290002"
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


def upgrade() -> None:
    if _has_table("ps405_users") and not _has_column("ps405_users", "mfa_secret"):
        op.add_column("ps405_users", sa.Column("mfa_secret", sa.String(length=64), nullable=True))


def downgrade() -> None:
    if _has_column("ps405_users", "mfa_secret"):
        op.drop_column("ps405_users", "mfa_secret")
