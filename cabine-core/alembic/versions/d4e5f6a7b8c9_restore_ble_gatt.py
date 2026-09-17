"""restore ble_gatt if renamed to ble_unicast

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-15 10:45:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Idempotente: quem já rodou o rename errado (GATT→unicast) volta para ble_gatt."""
    op.execute("UPDATE scales SET adapter = 'ble_gatt' WHERE adapter = 'ble_unicast'")
    op.execute(
        "UPDATE scales SET parser = 'gatt_16bit_overflow' WHERE parser = 'unicast_16bit_overflow'"
    )
    op.execute(
        "UPDATE scales SET name = 'Balança Tipo A (GATT)' "
        "WHERE address = 'A8:0B:6B:95:EC:79'"
    )
    op.execute(
        "UPDATE scale_measurements SET adapter = 'ble_gatt' WHERE adapter = 'ble_unicast'"
    )


def downgrade() -> None:
    pass
