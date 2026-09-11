"""oximeter readings per person

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-09-11 15:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "oximeter_readings",
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("device_name", sa.String(length=120), nullable=False),
        sa.Column("device_address", sa.String(length=40), nullable=True),
        sa.Column("spo2_pct", sa.Integer(), nullable=False),
        sa.Column("pulse_bpm", sa.Integer(), nullable=False),
        sa.Column("pi_pct", sa.Float(), nullable=True),
        sa.Column("stable", sa.Boolean(), nullable=False),
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
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_oximeter_readings_id"), "oximeter_readings", ["id"], unique=False)
    op.create_index(
        op.f("ix_oximeter_readings_person_id"),
        "oximeter_readings",
        ["person_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_oximeter_readings_person_id"), table_name="oximeter_readings")
    op.drop_index(op.f("ix_oximeter_readings_id"), table_name="oximeter_readings")
    op.drop_table("oximeter_readings")
