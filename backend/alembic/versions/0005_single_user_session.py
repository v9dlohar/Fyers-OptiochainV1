"""track the active user session"""

import sqlalchemy as sa

from alembic import op

revision = "0005_single_user_session"
down_revision = "0004_user_licenses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("session_id", sa.String(length=36)))


def downgrade() -> None:
    op.drop_column("users", "session_id")
