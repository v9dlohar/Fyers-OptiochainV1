"""store encrypted FYERS admin connection"""

import sqlalchemy as sa
from alembic import op

revision = "0002_broker_connections"
down_revision = "0001_auth_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "broker_connections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("encrypted_access_token", sa.String(length=1024), nullable=False),
        sa.Column("connected_by_user_id", sa.Integer(), nullable=False),
        sa.Column("connected_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["connected_by_user_id"], ["users.id"]),
        sa.UniqueConstraint("provider"),
    )
    op.create_index("ix_broker_connections_provider", "broker_connections", ["provider"])


def downgrade() -> None:
    op.drop_index("ix_broker_connections_provider", table_name="broker_connections")
    op.drop_table("broker_connections")
