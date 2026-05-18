"""sgdea archival custody foundation

Revision ID: 202605170001
Revises: 202605150001
Create Date: 2026-05-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

from app.db.models import Base

revision: str = "202605170001"
down_revision: str | None = "202605150001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _has_column(table: str, column: str) -> bool:
    inspector = inspect(op.get_bind())
    return column in {item["name"] for item in inspector.get_columns(table)}


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if not _has_column(table, column.name):
        op.add_column(table, column)


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())
    _add_column_if_missing("ps520_documents", sa.Column("ps930IdArchive", sa.Integer(), nullable=True))
    _add_column_if_missing("ps520_documents", sa.Column("ps950IdExpedient", sa.Integer(), nullable=True))
    _add_column_if_missing("ps520_documents", sa.Column("ps952IdFolder", sa.Integer(), nullable=True))
    _add_column_if_missing("ps520_documents", sa.Column("folio_start", sa.Integer(), nullable=True))
    _add_column_if_missing("ps520_documents", sa.Column("folio_end", sa.Integer(), nullable=True))
    _add_column_if_missing("ps520_documents", sa.Column("folio_total", sa.Integer(), nullable=True))
    _add_column_if_missing("ps520_documents", sa.Column("physical_location", sa.String(length=255), nullable=True))


def downgrade() -> None:
    for table in [
        "ps962_movement_traces",
        "ps960_kardex_movements",
        "ps958_document_loans",
        "ps956_inventory_fuid",
        "ps954_foliation",
        "ps952_folders",
        "ps950_expedients",
        "ps936_physical_boxes",
        "ps934_shelves",
        "ps932_archive_users",
        "ps930_archives",
    ]:
        op.drop_table(table)
    for column in ["physical_location", "folio_total", "folio_end", "folio_start", "ps952IdFolder", "ps950IdExpedient", "ps930IdArchive"]:
        if _has_column("ps520_documents", column):
            op.drop_column("ps520_documents", column)
