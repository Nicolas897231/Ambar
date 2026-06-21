"""hr company isolation — add company_id to HR entities

Revision ID: 202606130002
Revises: 202606130001
Create Date: 2026-06-13
"""
from alembic import op
from sqlalchemy import text

revision = "202606130002"
down_revision = "202606130001"
branch_labels = None
depends_on = None


def _has_column(conn, table: str, column: str) -> bool:
    result = conn.execute(text(f"SHOW COLUMNS FROM `{table}` LIKE '{column}'"))
    return result.rowcount > 0


def _has_index(conn, table: str, index_name: str) -> bool:
    result = conn.execute(text(f"SHOW INDEX FROM `{table}` WHERE Key_name = '{index_name}'"))
    return result.rowcount > 0


def _table_exists(conn, table: str) -> bool:
    result = conn.execute(text(f"SHOW TABLES LIKE '{table}'"))
    return result.rowcount > 0


def upgrade() -> None:
    conn = op.get_bind()

    tables = [
        ("ps1008_hr_positions",  "position_code",   "uq_hr_positions_code_company"),
        ("ps1006_hr_departments","department_code",  "uq_hr_departments_code_company"),
        ("ps1004_hr_candidates", "candidate_code",   "uq_hr_candidates_code_company"),
        ("ps1005_hr_vacancies",  "vacancy_code",     "uq_hr_vacancies_code_company"),
    ]

    for table, code_col, constraint_name in tables:
        if not _table_exists(conn, table):
            continue

        # 1. Add company_id column
        if not _has_column(conn, table, "company_id"):
            conn.execute(text(
                f"ALTER TABLE `{table}` ADD COLUMN company_id VARCHAR(40) NOT NULL DEFAULT 'default'"
            ))

        # 2. Add index on company_id
        idx_name = f"ix_{table}_company_id"
        if not _has_index(conn, table, idx_name):
            conn.execute(text(
                f"ALTER TABLE `{table}` ADD INDEX `{idx_name}` (company_id)"
            ))

        # 3. Drop old single-column unique index on code column if it still exists
        if _has_index(conn, table, code_col):
            conn.execute(text(f"ALTER TABLE `{table}` DROP INDEX `{code_col}`"))

        # 4. Add composite unique constraint (code + company_id)
        if not _has_index(conn, table, constraint_name):
            conn.execute(text(
                f"ALTER TABLE `{table}` ADD UNIQUE INDEX `{constraint_name}` ({code_col}, company_id)"
            ))


def downgrade() -> None:
    conn = op.get_bind()

    tables = [
        ("ps1008_hr_positions",  "position_code",   "uq_hr_positions_code_company"),
        ("ps1006_hr_departments","department_code",  "uq_hr_departments_code_company"),
        ("ps1004_hr_candidates", "candidate_code",   "uq_hr_candidates_code_company"),
        ("ps1005_hr_vacancies",  "vacancy_code",     "uq_hr_vacancies_code_company"),
    ]

    for table, code_col, constraint_name in tables:
        if not _table_exists(conn, table):
            continue
        if _has_index(conn, table, constraint_name):
            conn.execute(text(f"ALTER TABLE `{table}` DROP INDEX `{constraint_name}`"))
        if not _has_index(conn, table, code_col):
            conn.execute(text(f"ALTER TABLE `{table}` ADD UNIQUE INDEX `{code_col}` ({code_col})"))
        if _has_column(conn, table, "company_id"):
            conn.execute(text(f"ALTER TABLE `{table}` DROP COLUMN company_id"))
