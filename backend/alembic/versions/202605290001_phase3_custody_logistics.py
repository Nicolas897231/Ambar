"""phase 3 custody logistics

Revision ID: 202605290001
Revises: 202605280002
Create Date: 2026-05-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "202605290001"
down_revision: str | None = "202605280002"
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


def _has_index(table: str, index_name: str) -> bool:
    if not _has_table(table):
        return False
    return index_name in {item["name"] for item in _inspector().get_indexes(table)}


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if _has_table(table) and not _has_column(table, column.name):
        op.add_column(table, column)


def _create_index_if_missing(table: str, index_name: str, columns: list[str]) -> None:
    if _has_table(table) and not _has_index(table, index_name):
        op.create_index(index_name, table, columns)


def upgrade() -> None:
    _add_column_if_missing("ps934_shelves", sa.Column("floor", sa.String(length=80), nullable=True))
    _add_column_if_missing("ps934_shelves", sa.Column("module", sa.String(length=80), nullable=True))
    _add_column_if_missing("ps934_shelves", sa.Column("bay", sa.String(length=80), nullable=True))

    if not _has_table("ps964_custodianships"):
        op.create_table(
            "ps964_custodianships",
            sa.Column("idCustodianship", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("entity_type", sa.String(length=40), nullable=False),
            sa.Column("entity_id", sa.Integer(), nullable=False),
            sa.Column("ps930IdArchive", sa.Integer(), sa.ForeignKey("ps930_archives.idArchive"), nullable=False),
            sa.Column("custodian_identification", sa.String(length=40), sa.ForeignKey("ps405_users.identification"), nullable=True),
            sa.Column("current_location_path", sa.String(length=500), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=True),
            sa.Column("source_module", sa.String(length=80), nullable=True),
            sa.Column("related_movement_id", sa.Integer(), sa.ForeignKey("ps960_kardex_movements.idMovement"), nullable=True),
            sa.Column("related_transfer_id", sa.Integer(), sa.ForeignKey("ps1070_transfer_batches.idBatch"), nullable=True),
            sa.Column("related_loan_id", sa.Integer(), sa.ForeignKey("ps958_document_loans.idLoan"), nullable=True),
            sa.Column("is_current", sa.Boolean(), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )

    _create_index_if_missing("ps964_custodianships", "ix_custodianships_entity_type", ["entity_type"])
    _create_index_if_missing("ps964_custodianships", "ix_custodianships_entity_id", ["entity_id"])
    _create_index_if_missing("ps964_custodianships", "ix_custodianships_ps930IdArchive", ["ps930IdArchive"])
    _create_index_if_missing("ps964_custodianships", "ix_custodianships_status", ["status"])
    _create_index_if_missing("ps964_custodianships", "ix_custodianships_is_current", ["is_current"])
    _create_index_if_missing("ps964_custodianships", "ix_custodianships_entity_current", ["entity_type", "entity_id", "is_current"])
    _create_index_if_missing("ps964_custodianships", "ix_custodianships_archive_status", ["ps930IdArchive", "status"])


def downgrade() -> None:
    for index_name in [
        "ix_custodianships_archive_status",
        "ix_custodianships_entity_current",
        "ix_custodianships_is_current",
        "ix_custodianships_status",
        "ix_custodianships_ps930IdArchive",
        "ix_custodianships_entity_id",
        "ix_custodianships_entity_type",
    ]:
        if _has_index("ps964_custodianships", index_name):
            op.drop_index(index_name, table_name="ps964_custodianships")
    if _has_table("ps964_custodianships"):
        op.drop_table("ps964_custodianships")
    for column in ["bay", "module", "floor"]:
        if _has_column("ps934_shelves", column):
            op.drop_column("ps934_shelves", column)
