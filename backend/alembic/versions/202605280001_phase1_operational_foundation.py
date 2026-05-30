"""phase 1 operational foundation

Revision ID: 202605280001
Revises: 202605250001
Create Date: 2026-05-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202605280001"
down_revision: str | None = "202605250001"
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


def _create_index_if_missing(table: str, index_name: str, columns: list[str]) -> None:
    if _has_table(table) and not _has_index(table, index_name):
        op.create_index(index_name, table, columns)


def upgrade() -> None:
    if not _has_table("ps1006_hr_departments"):
        op.create_table(
            "ps1006_hr_departments",
            sa.Column("idDepartment", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("department_code", sa.String(length=40), nullable=False, unique=True),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("parent_id", sa.Integer(), sa.ForeignKey("ps1006_hr_departments.idDepartment"), nullable=True),
            sa.Column("responsible_identification", sa.String(length=40), sa.ForeignKey("ps405_users.identification"), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    if not _has_table("ps1004_hr_candidates"):
        op.create_table(
            "ps1004_hr_candidates",
            sa.Column("idCandidate", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("candidate_code", sa.String(length=40), nullable=False, unique=True),
            sa.Column("full_name", sa.String(length=180), nullable=False),
            sa.Column("email", sa.String(length=255), nullable=True),
            sa.Column("phone", sa.String(length=80), nullable=True),
            sa.Column("position_applied", sa.String(length=120), nullable=False),
            sa.Column("department", sa.String(length=120), nullable=False),
            sa.Column("status", sa.String(length=40), nullable=True),
            sa.Column("resume_document_id", sa.Integer(), sa.ForeignKey("ps520_documents.idDocument"), nullable=True),
            sa.Column("observations", sa.JSON(), nullable=True),
            sa.Column("created_by", sa.String(length=40), sa.ForeignKey("ps405_users.identification"), nullable=True),
            sa.Column("hired_employee_id", sa.String(length=40), sa.ForeignKey("ps1010_employees.identification"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    _create_index_if_missing("ps1006_hr_departments", "ix_hr_departments_status", ["status"])
    _create_index_if_missing("ps1004_hr_candidates", "ix_hr_candidates_status", ["status"])
    _create_index_if_missing("ps1004_hr_candidates", "ix_hr_candidates_email", ["email"])


def downgrade() -> None:
    for table, index_name in [
        ("ps1004_hr_candidates", "ix_hr_candidates_email"),
        ("ps1004_hr_candidates", "ix_hr_candidates_status"),
        ("ps1006_hr_departments", "ix_hr_departments_status"),
    ]:
        if _has_index(table, index_name):
            op.drop_index(index_name, table_name=table)
    if _has_table("ps1004_hr_candidates"):
        op.drop_table("ps1004_hr_candidates")
    if _has_table("ps1006_hr_departments"):
        op.drop_table("ps1006_hr_departments")
