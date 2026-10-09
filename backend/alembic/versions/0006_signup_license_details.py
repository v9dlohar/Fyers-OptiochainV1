"""store signup mobile numbers and expiring licenses"""

import sqlalchemy as sa

from alembic import op

revision = "0006_signup_license_details"
down_revision = "0005_single_user_session"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("mobile_number", sa.String(length=16)))
    op.add_column(
        "users",
        sa.Column("license_expires_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "license_expires_at")
    op.drop_column("users", "mobile_number")
