"""add user password change required flag

Revision ID: 202607190001
Revises: 202607150001
Create Date: 2026-07-19
"""
from alembic import op
from sqlalchemy import text

revision = "202607190001"
down_revision = "202607150001"
branch_labels = None
depends_on = None


def _column_exists(conn, table: str, column: str) -> bool:
    result = conn.execute(
        text(
            """
            SELECT COUNT(*) AS total
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = :table
              AND COLUMN_NAME = :column
            """
        ),
        {"table": table, "column": column},
    ).scalar()
    return bool(result)


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn, "ps405_users", "password_change_required"):
        conn.execute(
            text(
                """
                ALTER TABLE `ps405_users`
                ADD COLUMN `password_change_required` TINYINT(1) NOT NULL DEFAULT 0
                AFTER `auth_method`
                """
            )
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn, "ps405_users", "password_change_required"):
        conn.execute(text("ALTER TABLE `ps405_users` DROP COLUMN `password_change_required`"))
