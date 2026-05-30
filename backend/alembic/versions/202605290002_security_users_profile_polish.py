"""security users profile polish

Revision ID: 202605290002
Revises: 202605290001
Create Date: 2026-05-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202605290002"
down_revision: str | None = "202605290001"
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


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if _has_table(table) and not _has_column(table, column.name):
        op.add_column(table, column)


def upgrade() -> None:
    _add_column_if_missing("ps405_users", sa.Column("phone", sa.String(length=20), nullable=True))
    _add_column_if_missing("ps405_users", sa.Column("position_name", sa.String(length=120), nullable=True))
    _add_column_if_missing("ps405_users", sa.Column("department_name", sa.String(length=120), nullable=True))
    _add_column_if_missing("ps405_users", sa.Column("auth_method", sa.String(length=40), nullable=True, server_default="temporary_password"))
    _add_column_if_missing("ps405_users", sa.Column("mfa_enabled", sa.Boolean(), nullable=True, server_default=sa.false()))
    _add_column_if_missing("ps405_users", sa.Column("mechanical_signature_enabled", sa.Boolean(), nullable=True, server_default=sa.false()))
    _add_column_if_missing("ps405_users", sa.Column("digital_signature_ready", sa.Boolean(), nullable=True, server_default=sa.false()))
    _add_column_if_missing("ps405_users", sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=True))

    bind = op.get_bind()
    if _has_table("ps409_permissions"):
        existing = {row[0] for row in bind.execute(sa.text("select permission_key from ps409_permissions")).all()}
        modules = ["archive", "audit", "auth", "bi", "document", "hr", "notification", "platform", "search", "transfer", "trd", "users"]
        actions = ["view", "create", "update", "approve", "audit"]
        rows = [
            {"permission_key": f"{module}.{action}", "module": module, "description": f"{module}.{action}"}
            for module in modules
            for action in actions
            if f"{module}.{action}" not in existing
        ]
        if rows:
            op.bulk_insert(sa.table(
                "ps409_permissions",
                sa.column("permission_key", sa.String),
                sa.column("module", sa.String),
                sa.column("description", sa.String),
            ), rows)

    if _has_table("ps1006_hr_departments"):
        department_exists = bind.execute(sa.text("select 1 from ps1006_hr_departments where department_code = 'DEP-ARCH'")).first()
        if not department_exists:
            op.bulk_insert(sa.table(
                "ps1006_hr_departments",
                sa.column("department_code", sa.String),
                sa.column("name", sa.String),
                sa.column("status", sa.String),
            ), [{"department_code": "DEP-ARCH", "name": "Archivo", "status": "active"}])

    if _has_table("ps1008_hr_positions"):
        position_exists = bind.execute(sa.text("select 1 from ps1008_hr_positions where position_code = 'CAR-ADMIN'")).first()
        if not position_exists:
            op.bulk_insert(sa.table(
                "ps1008_hr_positions",
                sa.column("position_code", sa.String),
                sa.column("name", sa.String),
                sa.column("level", sa.String),
                sa.column("department", sa.String),
                sa.column("description", sa.String),
                sa.column("suggested_permissions", sa.JSON),
                sa.column("required_documents", sa.JSON),
                sa.column("status", sa.String),
            ), [{
                "position_code": "CAR-ADMIN",
                "name": "Administrador",
                "level": "direccion",
                "department": "Archivo",
                "description": "Cargo inicial para administracion de AMBAR",
                "suggested_permissions": {"items": ["users.manage", "archive.manage"]},
                "required_documents": {"items": []},
                "status": "active",
            }])


def downgrade() -> None:
    for column in [
        "access_expires_at",
        "digital_signature_ready",
        "mechanical_signature_enabled",
        "mfa_enabled",
        "auth_method",
        "department_name",
        "position_name",
        "phone",
    ]:
        if _has_column("ps405_users", column):
            op.drop_column("ps405_users", column)
