"""blood pressure readings per person

Revision ID: e1f2a3b4c5d6
Revises: c6d7e8f9a0b1
Create Date: 2026-09-17 11:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "c6d7e8f9a0b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "blood_pressure_readings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("device_name", sa.String(length=120), nullable=False),
        sa.Column("device_address", sa.String(length=40), nullable=True),
        sa.Column("sys_mmhg", sa.Integer(), nullable=False),
        sa.Column("dia_mmhg", sa.Integer(), nullable=False),
        sa.Column("pulse_bpm", sa.Integer(), nullable=False),
        sa.Column("movement", sa.Boolean(), nullable=False),
        sa.Column("irregular_heartbeat", sa.Boolean(), nullable=False),
        sa.Column("measured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("visit_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_blood_pressure_readings_id"), "blood_pressure_readings", ["id"], unique=False)
    op.create_index(
        op.f("ix_blood_pressure_readings_person_id"),
        "blood_pressure_readings",
        ["person_id"],
        unique=False,
    )
    op.create_index(
        "ix_blood_pressure_readings_visit_id",
        "blood_pressure_readings",
        ["visit_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_blood_pressure_readings_visit_id", table_name="blood_pressure_readings")
    op.drop_index(op.f("ix_blood_pressure_readings_person_id"), table_name="blood_pressure_readings")
    op.drop_index(op.f("ix_blood_pressure_readings_id"), table_name="blood_pressure_readings")
    op.drop_table("blood_pressure_readings")
