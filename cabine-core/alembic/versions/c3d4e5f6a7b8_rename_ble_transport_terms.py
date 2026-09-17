"""rename ble broadcast to gap (GATT stays GATT)

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-09-15 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE scales SET adapter = 'ble_gap' WHERE adapter = 'ble_broadcast'")
    op.execute("UPDATE scales SET adapter = 'ble_gatt' WHERE adapter = 'ble_unicast'")
    op.execute("UPDATE scales SET parser = 'gap_big_endian' WHERE parser = 'broadcast_big_endian'")
    op.execute(
        "UPDATE scales SET parser = 'gatt_16bit_overflow' WHERE parser = 'unicast_16bit_overflow'"
    )
    op.execute(
        "UPDATE scales SET name = 'Balança Tipo A (GATT)' "
        "WHERE address = 'A8:0B:6B:95:EC:79'"
    )
    op.execute(
        "UPDATE scales SET name = 'Balança Tipo B (GAP)' "
        "WHERE address = '78:66:A5:57:8E:B7'"
    )
    op.execute(
        "UPDATE scales SET name = 'Balança ICOMON (BIA)' "
        "WHERE address = '60:65:F4:CA:05:77'"
    )
    op.execute(
        "UPDATE scale_measurements SET adapter = 'ble_gap' WHERE adapter = 'ble_broadcast'"
    )
    op.execute(
        "UPDATE scale_measurements SET adapter = 'ble_gatt' WHERE adapter = 'ble_unicast'"
    )


def downgrade() -> None:
    op.execute("UPDATE scales SET adapter = 'ble_broadcast' WHERE adapter = 'ble_gap'")
    op.execute("UPDATE scales SET parser = 'broadcast_big_endian' WHERE parser = 'gap_big_endian'")
    op.execute(
        "UPDATE scale_measurements SET adapter = 'ble_broadcast' WHERE adapter = 'ble_gap'"
    )
