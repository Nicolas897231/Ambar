"""performance indexes — compound indexes for frequent query patterns

Revision ID: 202606130003
Revises: 202606130002
Create Date: 2026-06-13
"""
from alembic import op
from sqlalchemy import text

revision = "202606130003"
down_revision = "202606130002"
branch_labels = None
depends_on = None


def _has_index(conn, table: str, index_name: str) -> bool:
    result = conn.execute(text(f"SHOW INDEX FROM `{table}` WHERE Key_name = '{index_name}'"))
    return result.rowcount > 0


def _has_column(conn, table: str, column: str) -> bool:
    result = conn.execute(text(f"SHOW COLUMNS FROM `{table}` LIKE '{column}'"))
    return result.rowcount > 0


def _table_exists(conn, table: str) -> bool:
    result = conn.execute(text(f"SHOW TABLES LIKE '{table}'"))
    return result.rowcount > 0


def upgrade() -> None:
    conn = op.get_bind()

    # Each entry: (table, index_name, col_list, required_cols)
    # required_cols: all columns must exist before adding the index
    indexes = [
        ("ps820_audit_log", "ix_audit_log_user_created",    "ps405Identification, created_at",  ["ps405Identification", "created_at"]),
        ("ps820_audit_log", "ix_audit_log_module_action",   "module, action",                   ["module", "action"]),
        ("ps520_documents", "ix_documents_company_created", "company_id, created_at",           ["company_id", "created_at"]),
        ("ps405_users",     "ix_users_company_status",      "company_id, status",               ["company_id", "status"]),
    ]

    for table, idx_name, cols, required in indexes:
        if not _table_exists(conn, table):
            continue
        if not all(_has_column(conn, table, c) for c in required):
            continue
        if not _has_index(conn, table, idx_name):
            conn.execute(text(f"ALTER TABLE `{table}` ADD INDEX `{idx_name}` ({cols})"))


def downgrade() -> None:
    conn = op.get_bind()

    indexes = [
        ("ps820_audit_log", "ix_audit_log_user_created"),
        ("ps820_audit_log", "ix_audit_log_module_action"),
        ("ps520_documents", "ix_documents_company_created"),
        ("ps405_users",     "ix_users_company_status"),
    ]

    for table, idx_name in indexes:
        if not _table_exists(conn, table):
            continue
        if _has_index(conn, table, idx_name):
            conn.execute(text(f"ALTER TABLE `{table}` DROP INDEX `{idx_name}`"))
