"""add configurable dashboard layouts

Revision ID: 202607150001
Revises: 202607140001
Create Date: 2026-07-15
"""
from alembic import op
from sqlalchemy import text

revision = "202607150001"
down_revision = "202607140001"
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return conn.execute(text(f"SHOW TABLES LIKE '{table}'")).rowcount > 0


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "ps418_user_dashboard_layouts"):
        conn.execute(text("""
            CREATE TABLE `ps418_user_dashboard_layouts` (
                `idLayout` INT NOT NULL AUTO_INCREMENT,
                `ps405Identification` VARCHAR(40) NOT NULL,
                `company_id` VARCHAR(40) NOT NULL DEFAULT 'default',
                `layout_name` VARCHAR(80) NOT NULL DEFAULT 'operational',
                `widgets` JSON NOT NULL,
                `is_default` TINYINT(1) NOT NULL DEFAULT 1,
                `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NULL,
                PRIMARY KEY (`idLayout`),
                UNIQUE KEY `uq_dashboard_layout_user_name` (`ps405Identification`, `layout_name`),
                KEY `ix_dashboard_layout_company_user` (`company_id`, `ps405Identification`),
                CONSTRAINT `fk_dashboard_layout_user` FOREIGN KEY (`ps405Identification`) REFERENCES `ps405_users` (`identification`)
            )
        """))


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "ps418_user_dashboard_layouts"):
        conn.execute(text("DROP TABLE `ps418_user_dashboard_layouts`"))
