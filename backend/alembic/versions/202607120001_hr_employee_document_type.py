"""add employee document type

Revision ID: 202607120001
Revises: 202607090001
Create Date: 2026-07-12
"""
from alembic import op
from sqlalchemy import text

revision = "202607120001"
down_revision = "202607090001"
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return conn.execute(text(f"SHOW TABLES LIKE '{table}'")).rowcount > 0


def _has_column(conn, table: str, column: str) -> bool:
    return conn.execute(text(f"SHOW COLUMNS FROM `{table}` LIKE '{column}'")).rowcount > 0


def _has_index(conn, table: str, index_name: str) -> bool:
    return conn.execute(text(f"SHOW INDEX FROM `{table}` WHERE Key_name = '{index_name}'")).rowcount > 0


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "ps1010_employees"):
        return
    if not _has_column(conn, "ps1010_employees", "document_type"):
        conn.execute(text("ALTER TABLE `ps1010_employees` ADD COLUMN `document_type` VARCHAR(40) NOT NULL DEFAULT 'cc' AFTER `employee_code`"))
    if _has_column(conn, "ps1010_employees", "company_id") and not _has_index(conn, "ps1010_employees", "ix_employees_company_document_type"):
        conn.execute(text("ALTER TABLE `ps1010_employees` ADD INDEX `ix_employees_company_document_type` (`company_id`, `document_type`)"))


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "ps1010_employees"):
        return
    if _has_index(conn, "ps1010_employees", "ix_employees_company_document_type"):
        conn.execute(text("ALTER TABLE `ps1010_employees` DROP INDEX `ix_employees_company_document_type`"))
    if _has_column(conn, "ps1010_employees", "document_type"):
        conn.execute(text("ALTER TABLE `ps1010_employees` DROP COLUMN `document_type`"))
