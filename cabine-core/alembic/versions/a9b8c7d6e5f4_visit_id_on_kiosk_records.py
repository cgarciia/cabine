"""visit_id on kiosk records

Revision ID: a9b8c7d6e5f4
Revises: d4e5f6a7b8c9
Create Date: 2026-09-15 13:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("form_submissions", sa.Column("visit_id", sa.Uuid(), nullable=True))
    op.create_index("ix_form_submissions_visit_id", "form_submissions", ["visit_id"])
    op.add_column("scale_measurements", sa.Column("visit_id", sa.Uuid(), nullable=True))
    op.create_index("ix_scale_measurements_visit_id", "scale_measurements", ["visit_id"])
    op.add_column("oximeter_readings", sa.Column("visit_id", sa.Uuid(), nullable=True))
    op.create_index("ix_oximeter_readings_visit_id", "oximeter_readings", ["visit_id"])


def downgrade() -> None:
    op.drop_index("ix_oximeter_readings_visit_id", table_name="oximeter_readings")
    op.drop_column("oximeter_readings", "visit_id")
    op.drop_index("ix_scale_measurements_visit_id", table_name="scale_measurements")
    op.drop_column("scale_measurements", "visit_id")
    op.drop_index("ix_form_submissions_visit_id", table_name="form_submissions")
    op.drop_column("form_submissions", "visit_id")
