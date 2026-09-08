"""criar tabela scales

Revision ID: c4b1e8a92f10
Revises: 0f7a52fb5985
Create Date: 2026-09-08 08:51:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4b1e8a92f10"
down_revision: Union[str, Sequence[str], None] = "0f7a52fb5985"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "scales",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("adapter", sa.String(length=40), nullable=False),
        sa.Column("address", sa.String(length=120), nullable=False),
        sa.Column("parser", sa.String(length=60), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scales_address"), "scales", ["address"], unique=True)
    op.create_index(op.f("ix_scales_id"), "scales", ["id"], unique=False)

    op.execute(
        """
        INSERT INTO scales (id, name, adapter, address, parser, is_active, is_default)
        VALUES
            (
                '7a66a557-8eb7-4000-8000-7866a5578eb7',
                'Balança Tipo B (Broadcast)',
                'ble_broadcast',
                '78:66:A5:57:8E:B7',
                'broadcast_big_endian',
                true,
                true
            ),
            (
                'a80b6b95-ec79-4000-8000-a80b6b95ec79',
                'Balança Tipo A (GATT)',
                'ble_gatt',
                'A8:0B:6B:95:EC:79',
                'gatt_16bit_overflow',
                true,
                false
            )
        """
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_scales_id"), table_name="scales")
    op.drop_index(op.f("ix_scales_address"), table_name="scales")
    op.drop_table("scales")
