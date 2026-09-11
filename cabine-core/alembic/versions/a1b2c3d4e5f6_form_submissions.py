"""form submissions per person

Revision ID: a1b2c3d4e5f6
Revises: e8c4a91b27d0
Create Date: 2026-09-10 09:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "e8c4a91b27d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "form_submissions",
        sa.Column("person_id", sa.Uuid(), nullable=False),
        sa.Column("module", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
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
    op.create_index(op.f("ix_form_submissions_id"), "form_submissions", ["id"], unique=False)
    op.create_index(op.f("ix_form_submissions_person_id"), "form_submissions", ["person_id"], unique=False)
    op.create_index(op.f("ix_form_submissions_module"), "form_submissions", ["module"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_form_submissions_module"), table_name="form_submissions")
    op.drop_index(op.f("ix_form_submissions_person_id"), table_name="form_submissions")
    op.drop_index(op.f("ix_form_submissions_id"), table_name="form_submissions")
    op.drop_table("form_submissions")
