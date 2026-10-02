"""cabin machine id

Revision ID: g7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-02 08:50:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "g7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("cabins", sa.Column("machine_id", sa.String(length=64), nullable=True))
    op.create_unique_constraint("uq_cabins_machine_id", "cabins", ["machine_id"])


def downgrade() -> None:
    op.drop_constraint("uq_cabins_machine_id", "cabins", type_="unique")
    op.drop_column("cabins", "machine_id")
