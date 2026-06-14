"""security_audit_enhancements

Revision ID: 202606130001
Revises: 202606060001
Create Date: 2026-06-13

Cambios:
  - ps820_audit_log: columnas Laravel-Auditing-style (event, auditable_type, auditable_id, url, tags)
  - ps1004_hr_candidates: unicidad de email (previene candidatos duplicados)
  - ps820_audit_log: índices adicionales para consultas de auditoría eficientes
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "202606130001"
down_revision = "202606060001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _inspector():
    return inspect(op.get_bind())


def _has_column(table: str, column: str) -> bool:
    if table not in _inspector().get_table_names():
        return False
    return column in {item["name"] for item in _inspector().get_columns(table)}


def _has_index(table: str, index_name: str) -> bool:
    if table not in _inspector().get_table_names():
        return False
    return index_name in {item["name"] for item in _inspector().get_indexes(table)}


def _has_constraint(table: str, constraint_name: str) -> bool:
    if table not in _inspector().get_table_names():
        return False
    uqs = _inspector().get_unique_constraints(table)
    return any(c["name"] == constraint_name for c in uqs)


def upgrade() -> None:
    # ── AuditLog: columnas estilo Laravel Auditing ─────────────────────────────
    audit_columns = [
        ("event",          sa.Column("event", sa.String(80), nullable=True)),
        ("auditable_type", sa.Column("auditable_type", sa.String(120), nullable=True)),
        ("auditable_id",   sa.Column("auditable_id", sa.String(80), nullable=True)),
        ("url",            sa.Column("url", sa.String(500), nullable=True)),
        ("tags",           sa.Column("tags", sa.JSON(), nullable=True, server_default="[]")),
    ]
    for col_name, col_def in audit_columns:
        if not _has_column("ps820_audit_log", col_name):
            op.add_column("ps820_audit_log", col_def)

    if not _has_index("ps820_audit_log", "ix_ps820_audit_log_event"):
        op.create_index("ix_ps820_audit_log_event", "ps820_audit_log", ["event"])

    if not _has_index("ps820_audit_log", "ix_ps820_audit_log_auditable"):
        op.create_index(
            "ix_ps820_audit_log_auditable",
            "ps820_audit_log",
            ["auditable_type", "auditable_id"],
        )

    # ── HRCandidate: unicidad de email ────────────────────────────────────────
    # Primero limpiar duplicados si existen (mantener el más reciente)
    op.execute("""
        DELETE c1 FROM ps1004_hr_candidates c1
        INNER JOIN ps1004_hr_candidates c2
        WHERE c1.idCandidate < c2.idCandidate
          AND c1.email = c2.email
          AND c1.email IS NOT NULL
    """)

    if not _has_constraint("ps1004_hr_candidates", "uq_hr_candidates_email"):
        with op.batch_alter_table("ps1004_hr_candidates") as batch_op:
            batch_op.create_unique_constraint("uq_hr_candidates_email", ["email"])


def downgrade() -> None:
    if _has_constraint("ps1004_hr_candidates", "uq_hr_candidates_email"):
        with op.batch_alter_table("ps1004_hr_candidates") as batch_op:
            batch_op.drop_constraint("uq_hr_candidates_email", type_="unique")

    if _has_index("ps820_audit_log", "ix_ps820_audit_log_auditable"):
        op.drop_index("ix_ps820_audit_log_auditable", table_name="ps820_audit_log")

    if _has_index("ps820_audit_log", "ix_ps820_audit_log_event"):
        op.drop_index("ix_ps820_audit_log_event", table_name="ps820_audit_log")
