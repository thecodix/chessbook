"""add missing endgame_progress wins/win_streak columns for pre-alembic dbs

Revision ID: c7187c77b0c7
Revises: 83fbf6fded67
Create Date: 2026-08-19 10:57:29.876219

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7187c77b0c7'
down_revision: Union[str, Sequence[str], None] = '83fbf6fded67'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # `wins`/`win_streak` were added to the ORM model on 2026-07-31, back
    # when schema changes were applied via Base.metadata.create_all() rather
    # than Alembic — which only creates missing tables, never adds missing
    # columns to a table that already exists. Any database that already had
    # `endgame_progress` before that date (i.e. production, later adopted
    # into Alembic via a one-time `alembic stamp f68b422faa99` per
    # DEPLOYMENT_CHECKLIST.md rather than actually running the initial
    # migration's DDL) is still missing both columns. `IF NOT EXISTS` makes
    # this safe to also run against databases that already have them (any
    # DB built by running `alembic upgrade head` from scratch, which already
    # creates both columns as part of f68b422faa99).
    op.execute("ALTER TABLE endgame_progress ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0")
    op.execute("ALTER TABLE endgame_progress ADD COLUMN IF NOT EXISTS win_streak INTEGER NOT NULL DEFAULT 0")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('endgame_progress', 'win_streak')
    op.drop_column('endgame_progress', 'wins')
