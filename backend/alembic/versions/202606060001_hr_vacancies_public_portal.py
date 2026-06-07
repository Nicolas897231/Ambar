"""hr vacancies public portal

Revision ID: 202606060001
Revises: 202606030003
Create Date: 2026-06-06
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202606060001"
down_revision: str | None = "202606030003"
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
    if not _has_table("ps1005_hr_vacancies"):
        op.create_table(
            "ps1005_hr_vacancies",
            sa.Column("idVacancy", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("vacancy_code", sa.String(length=50), nullable=False),
            sa.Column("title", sa.String(length=160), nullable=False),
            sa.Column("department", sa.String(length=120), nullable=False),
            sa.Column("ps1008IdPosition", sa.Integer(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("requirements", sa.JSON(), nullable=True),
            sa.Column("contract_type", sa.String(length=80), nullable=True),
            sa.Column("location", sa.String(length=120), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False, server_default="open"),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(length=40), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(["created_by"], ["ps405_users.identification"]),
            sa.ForeignKeyConstraint(["ps1008IdPosition"], ["ps1008_hr_positions.idPosition"]),
            sa.PrimaryKeyConstraint("idVacancy"),
            sa.UniqueConstraint("vacancy_code"),
        )
    if not _has_index("ps1005_hr_vacancies", "ix_ps1005_hr_vacancies_status"):
        op.create_index("ix_ps1005_hr_vacancies_status", "ps1005_hr_vacancies", ["status"])
    if not _has_index("ps1005_hr_vacancies", "ix_ps1005_hr_vacancies_status_department"):
        op.create_index("ix_ps1005_hr_vacancies_status_department", "ps1005_hr_vacancies", ["status", "department"])
    if not _has_index("ps1005_hr_vacancies", "ix_ps1005_hr_vacancies_position"):
        op.create_index("ix_ps1005_hr_vacancies_position", "ps1005_hr_vacancies", ["ps1008IdPosition"])


def downgrade() -> None:
    pass
