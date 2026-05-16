"""initial enterprise schema

Revision ID: 202605150001
Revises:
Create Date: 2026-05-15
"""

from collections.abc import Sequence

from alembic import op

from app.db.models import Base

revision: str = "202605150001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())