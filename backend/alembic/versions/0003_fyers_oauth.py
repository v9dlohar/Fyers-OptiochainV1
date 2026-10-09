"""add FYERS refresh token and OAuth state storage"""

import sqlalchemy as sa
from alembic import op

revision = "0003_fyers_oauth"
down_revision = "0002_broker_connections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "broker_connections",
        sa.Column("encrypted_refresh_token", sa.String(length=1024), nullable=True),
    )
    op.create_table(
        "fyers_oauth_states",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("state_hash"),
    )
    op.create_index("ix_fyers_oauth_states_state_hash", "fyers_oauth_states", ["state_hash"])


def downgrade() -> None:
    op.drop_index("ix_fyers_oauth_states_state_hash", table_name="fyers_oauth_states")
    op.drop_table("fyers_oauth_states")
    op.drop_column("broker_connections", "encrypted_refresh_token")
