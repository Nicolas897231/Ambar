"""add manual correspondence radication

Revision ID: 202607140001
Revises: 202607120001
Create Date: 2026-07-14
"""
from alembic import op
from sqlalchemy import text

revision = "202607140001"
down_revision = "202607120001"
branch_labels = None
depends_on = None


def _table_exists(conn, table: str) -> bool:
    return conn.execute(text(f"SHOW TABLES LIKE '{table}'")).rowcount > 0


def _has_index(conn, table: str, index_name: str) -> bool:
    return conn.execute(text(f"SHOW INDEX FROM `{table}` WHERE Key_name = '{index_name}'")).rowcount > 0


def _ensure_index(conn, table: str, index_name: str, columns: str) -> None:
    if _table_exists(conn, table) and not _has_index(conn, table, index_name):
        conn.execute(text(f"ALTER TABLE `{table}` ADD INDEX `{index_name}` ({columns})"))


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "ps1260_correspondence_records"):
        conn.execute(text("""
            CREATE TABLE `ps1260_correspondence_records` (
                `idRecord` INT NOT NULL AUTO_INCREMENT,
                `radicado_code` VARCHAR(80) NOT NULL,
                `direction` VARCHAR(20) NOT NULL DEFAULT 'inbound',
                `sender_type` VARCHAR(40) NULL,
                `sender_name` VARCHAR(180) NULL,
                `sender_document` VARCHAR(60) NULL,
                `sender_email` VARCHAR(255) NULL,
                `sender_phone` VARCHAR(40) NULL,
                `recipient_name` VARCHAR(180) NULL,
                `recipient_document` VARCHAR(60) NULL,
                `recipient_email` VARCHAR(255) NULL,
                `subject` VARCHAR(240) NOT NULL,
                `description` TEXT NULL,
                `communication_type` VARCHAR(60) NOT NULL DEFAULT 'carta',
                `reception_channel` VARCHAR(60) NULL,
                `ps608IdDependency` INT NULL,
                `assigned_to` VARCHAR(40) NULL,
                `ps950IdExpedient` INT NULL,
                `ps520IdDocument` INT NULL,
                `priority` VARCHAR(30) NOT NULL DEFAULT 'normal',
                `status` VARCHAR(40) NOT NULL DEFAULT 'radicado',
                `due_at` DATETIME NULL,
                `responded_at` DATETIME NULL,
                `closed_at` DATETIME NULL,
                `cancelled_at` DATETIME NULL,
                `created_by` VARCHAR(40) NOT NULL,
                `company_id` VARCHAR(40) NOT NULL DEFAULT 'default',
                `metadata_json` JSON NULL,
                `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME NULL,
                PRIMARY KEY (`idRecord`),
                UNIQUE KEY `uq_correspondence_company_code` (`company_id`, `radicado_code`),
                CONSTRAINT `fk_corr_dependency` FOREIGN KEY (`ps608IdDependency`) REFERENCES `ps608_trd_dependencies` (`idDependency`),
                CONSTRAINT `fk_corr_assigned_user` FOREIGN KEY (`assigned_to`) REFERENCES `ps405_users` (`identification`),
                CONSTRAINT `fk_corr_creator_user` FOREIGN KEY (`created_by`) REFERENCES `ps405_users` (`identification`),
                CONSTRAINT `fk_corr_expedient` FOREIGN KEY (`ps950IdExpedient`) REFERENCES `ps950_expedients` (`idExpedient`),
                CONSTRAINT `fk_corr_document` FOREIGN KEY (`ps520IdDocument`) REFERENCES `ps520_documents` (`idDocument`)
            )
        """))

    if not _table_exists(conn, "ps1262_correspondence_events"):
        conn.execute(text("""
            CREATE TABLE `ps1262_correspondence_events` (
                `idEvent` INT NOT NULL AUTO_INCREMENT,
                `ps1260IdRecord` INT NOT NULL,
                `action` VARCHAR(80) NOT NULL,
                `ps405Identification` VARCHAR(40) NULL,
                `notes` TEXT NULL,
                `old_values` JSON NULL,
                `new_values` JSON NULL,
                `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`idEvent`),
                CONSTRAINT `fk_corr_event_record` FOREIGN KEY (`ps1260IdRecord`) REFERENCES `ps1260_correspondence_records` (`idRecord`) ON DELETE CASCADE,
                CONSTRAINT `fk_corr_event_user` FOREIGN KEY (`ps405Identification`) REFERENCES `ps405_users` (`identification`)
            )
        """))

    _ensure_index(conn, "ps1260_correspondence_records", "ix_correspondence_company_direction_status", "`company_id`, `direction`, `status`")
    _ensure_index(conn, "ps1260_correspondence_records", "ix_correspondence_assigned_status", "`assigned_to`, `status`")
    _ensure_index(conn, "ps1260_correspondence_records", "ix_correspondence_due", "`company_id`, `due_at`, `status`")
    _ensure_index(conn, "ps1260_correspondence_records", "ix_correspondence_expedient", "`ps950IdExpedient`")
    _ensure_index(conn, "ps1260_correspondence_records", "ix_correspondence_document", "`ps520IdDocument`")
    _ensure_index(conn, "ps1262_correspondence_events", "ix_correspondence_events_record_created", "`ps1260IdRecord`, `created_at`")


def downgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "ps1262_correspondence_events"):
        conn.execute(text("DROP TABLE `ps1262_correspondence_events`"))
    if _table_exists(conn, "ps1260_correspondence_records"):
        conn.execute(text("DROP TABLE `ps1260_correspondence_records`"))
