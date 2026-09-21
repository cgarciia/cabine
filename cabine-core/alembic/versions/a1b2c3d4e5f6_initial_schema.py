"""initial schema

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-09-21 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps() -> tuple[sa.Column, sa.Column]:
    return (
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
    )


def upgrade() -> None:
    created_at, updated_at = _timestamps()
    op.create_table(
        "users",
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_id"), "users", ["id"], unique=False)
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    created_at, updated_at = _timestamps()
    op.create_table(
        "fhir_patients",
        sa.Column("fhir_id", sa.String(), nullable=False),
        sa.Column("resource", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_fhir_patients_id"), "fhir_patients", ["id"], unique=False)
    op.create_index(op.f("ix_fhir_patients_fhir_id"), "fhir_patients", ["fhir_id"], unique=True)

    created_at, updated_at = _timestamps()
    op.create_table(
        "people",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("registration", sa.String(length=40), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("age", sa.Integer(), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("sex", sa.String(length=16), nullable=False),
        sa.Column("people_type", sa.String(length=20), nullable=False),
        sa.Column("expected_weight_kg", sa.Float(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_people_id"), "people", ["id"], unique=False)
    op.create_index(op.f("ix_people_registration"), "people", ["registration"], unique=True)

    created_at, updated_at = _timestamps()
    op.create_table(
        "scales",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("adapter", sa.String(length=40), nullable=False),
        sa.Column("address", sa.String(length=120), nullable=False),
        sa.Column("parser", sa.String(length=60), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scales_id"), "scales", ["id"], unique=False)
    op.create_index(op.f("ix_scales_address"), "scales", ["address"], unique=True)
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
        """
    )

    created_at, updated_at = _timestamps()
    op.create_table(
        "scale_measurements",
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("scale_id", sa.Uuid(), nullable=True),
        sa.Column("scale_name", sa.String(length=120), nullable=False),
        sa.Column("adapter", sa.String(length=40), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("age", sa.Integer(), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("sex", sa.String(length=16), nullable=False),
        sa.Column("people_type", sa.String(length=20), nullable=False),
        sa.Column("expected_weight_kg", sa.Float(), nullable=True),
        sa.Column("stable", sa.Boolean(), nullable=False),
        sa.Column("complete", sa.Boolean(), nullable=False),
        sa.Column("impedances_ohm", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("segments", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("metrics", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("visit_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scale_id"], ["scales.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scale_measurements_id"), "scale_measurements", ["id"], unique=False)
    op.create_index(op.f("ix_scale_measurements_person_id"), "scale_measurements", ["person_id"], unique=False)
    op.create_index(op.f("ix_scale_measurements_scale_id"), "scale_measurements", ["scale_id"], unique=False)
    op.create_index(op.f("ix_scale_measurements_visit_id"), "scale_measurements", ["visit_id"], unique=False)

    created_at, updated_at = _timestamps()
    op.create_table(
        "form_submissions",
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("module", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("visit_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_form_submissions_id"), "form_submissions", ["id"], unique=False)
    op.create_index(op.f("ix_form_submissions_person_id"), "form_submissions", ["person_id"], unique=False)
    op.create_index(op.f("ix_form_submissions_module"), "form_submissions", ["module"], unique=False)
    op.create_index(op.f("ix_form_submissions_visit_id"), "form_submissions", ["visit_id"], unique=False)

    created_at, updated_at = _timestamps()
    op.create_table(
        "oximeter_readings",
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("device_name", sa.String(length=120), nullable=False),
        sa.Column("device_address", sa.String(length=40), nullable=True),
        sa.Column("spo2_pct", sa.Integer(), nullable=False),
        sa.Column("pulse_bpm", sa.Integer(), nullable=False),
        sa.Column("pi_pct", sa.Float(), nullable=True),
        sa.Column("stable", sa.Boolean(), nullable=False),
        sa.Column("waveform", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("visit_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.ForeignKeyConstraint(["person_id"], ["people.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_oximeter_readings_id"), "oximeter_readings", ["id"], unique=False)
    op.create_index(op.f("ix_oximeter_readings_person_id"), "oximeter_readings", ["person_id"], unique=False)
    op.create_index(op.f("ix_oximeter_readings_visit_id"), "oximeter_readings", ["visit_id"], unique=False)

    created_at, updated_at = _timestamps()
    op.create_table(
        "blood_pressure_readings",
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
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
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
        op.f("ix_blood_pressure_readings_visit_id"),
        "blood_pressure_readings",
        ["visit_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_table("blood_pressure_readings")
    op.drop_table("oximeter_readings")
    op.drop_table("form_submissions")
    op.drop_table("scale_measurements")
    op.drop_table("scales")
    op.drop_table("people")
    op.drop_table("fhir_patients")
    op.drop_table("users")
