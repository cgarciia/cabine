"""add people.matricula

Revision ID: f1a2b3c4d5e6
Revises: e8c4a91b27d0
Create Date: 2026-09-11 16:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e8c4a91b27d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("people", sa.Column("matricula", sa.String(length=40), nullable=True))
    op.create_index(op.f("ix_people_matricula"), "people", ["matricula"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_people_matricula"), table_name="people")
    op.drop_column("people", "matricula")
