"""add user market-data licenses"""

import sqlalchemy as sa

from alembic import op

revision = "0004_user_licenses"
down_revision = "0003_fyers_oauth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "license_active",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "license_active")
