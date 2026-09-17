"""oximeter pleth waveform on readings

Revision ID: c6d7e8f9a0b1
Revises: a9b8c7d6e5f4
Create Date: 2026-09-16 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, Sequence[str], None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "oximeter_readings",
        sa.Column("waveform", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("oximeter_readings", "waveform")
