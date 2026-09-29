"""seed default operator

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-28 15:15:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# bcrypt of "admin". Login: admin@cabine.local / admin
_ADMIN_ID = "a1d0c0de-0000-4000-8000-000000000001"
_ADMIN_EMAIL = "admin@cabine.local"
_ADMIN_HASH = "$2b$12$cMFT3EYSFE0xG1XSF0A1u.RDdTToTE7t62Sl.4vX4q9wus39.mIGu"


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO users (id, email, hashed_password, is_active, created_at, updated_at)
        VALUES (
            '{_ADMIN_ID}',
            '{_ADMIN_EMAIL}',
            '{_ADMIN_HASH}',
            true,
            now(),
            now()
        )
        ON CONFLICT (email) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM users WHERE email = '{_ADMIN_EMAIL}'")
