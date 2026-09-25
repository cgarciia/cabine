"""drop redundant PK indexes, index blood_pressure_readings.measured_at

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-09-25 11:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The primary key already carries a unique index.
_PK_INDEXED_TABLES = (
    "users",
    "fhir_patients",
    "people",
    "scales",
    "scale_measurements",
    "form_submissions",
    "oximeter_readings",
    "blood_pressure_readings",
)


def upgrade() -> None:
    for table in _PK_INDEXED_TABLES:
        op.drop_index(f"ix_{table}_id", table_name=table)
    op.create_index(
        "ix_blood_pressure_readings_measured_at",
        "blood_pressure_readings",
        ["measured_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_blood_pressure_readings_measured_at", table_name="blood_pressure_readings")
    for table in _PK_INDEXED_TABLES:
        op.create_index(f"ix_{table}_id", table, ["id"], unique=False)
