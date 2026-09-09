"""seed balanca relaxmedic icomon

Revision ID: d5e2f1a03c44
Revises: c4b1e8a92f10
Create Date: 2026-09-08 11:47:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d5e2f1a03c44"
down_revision: Union[str, Sequence[str], None] = "c4b1e8a92f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE scales SET is_default = false WHERE is_default = true")
    op.execute(
        """
        INSERT INTO scales (id, name, adapter, address, parser, is_active, is_default)
        VALUES (
            '6065f4ca-0577-4000-8000-6065f4ca0577',
            'Relaxmedic RM-RD2504A',
            'ble_icomon',
            '60:65:F4:CA:05:77',
            'icomon_ffb2',
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
    op.execute(
        """
        UPDATE scales
        SET is_default = true
        WHERE address = '78:66:A5:57:8E:B7'
        """
    )
