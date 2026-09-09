"""people and measurements

Revision ID: e8c4a91b27d0
Revises: d5e2f1a03c44
Create Date: 2026-09-08 17:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e8c4a91b27d0"
down_revision: Union[str, Sequence[str], None] = "d5e2f1a03c44"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("age", sa.Integer(), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("sex", sa.String(length=16), nullable=False),
        sa.Column("people_type", sa.String(length=20), nullable=False),
        sa.Column("expected_weight_kg", sa.Float(), nullable=True),
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
    op.create_index(op.f("ix_people_id"), "people", ["id"], unique=False)

    op.create_table(
        "scale_measurements",
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("scale_id", sa.Uuid(), nullable=True),
        sa.Column("scale_name", sa.String(length=120), nullable=False),
        sa.Column("adapter", sa.String(length=40), nullable=False),
        sa.Column("peso_kg", sa.Float(), nullable=False),
        sa.Column("height_cm", sa.Float(), nullable=False),
        sa.Column("age", sa.Integer(), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("sex", sa.String(length=16), nullable=False),
        sa.Column("people_type", sa.String(length=20), nullable=False),
        sa.Column("expected_weight_kg", sa.Float(), nullable=True),
        sa.Column("estavel", sa.Boolean(), nullable=False),
        sa.Column("completo", sa.Boolean(), nullable=False),
        sa.Column("impedancias_ohm", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("segmentos", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("metricas", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
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
        sa.ForeignKeyConstraint(["scale_id"], ["scales.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scale_measurements_id"), "scale_measurements", ["id"], unique=False)
    op.create_index(
        op.f("ix_scale_measurements_person_id"),
        "scale_measurements",
        ["person_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_scale_measurements_scale_id"),
        "scale_measurements",
        ["scale_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_scale_measurements_scale_id"), table_name="scale_measurements")
    op.drop_index(op.f("ix_scale_measurements_person_id"), table_name="scale_measurements")
    op.drop_index(op.f("ix_scale_measurements_id"), table_name="scale_measurements")
    op.drop_table("scale_measurements")
    op.drop_index(op.f("ix_people_id"), table_name="people")
    op.drop_table("people")
