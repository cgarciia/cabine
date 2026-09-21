"""seed default RM-RD2504A scale

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-21 14:20:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE scales SET is_default = false WHERE is_default = true")
    op.execute(
        """
        INSERT INTO scales (id, name, adapter, address, parser, is_active, is_default)
        VALUES (
            '6065f4ca-0577-4000-8000-6065f4ca0577',
            'RM-RD2504A',
            'ble_rm_rd2504a',
            '60:65:F4:CA:05:77',
            'rm_rd2504a_ffb2',
            true,
            true
        )
        ON CONFLICT (address) DO UPDATE SET
            name = EXCLUDED.name,
            adapter = EXCLUDED.adapter,
            parser = EXCLUDED.parser,
            is_active = true,
            is_default = true
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM scales WHERE address = '60:65:F4:CA:05:77'")
