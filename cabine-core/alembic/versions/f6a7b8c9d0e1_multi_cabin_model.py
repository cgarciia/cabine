"""multi-cabin model: cabins, devices, sessions, admins

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-01 14:40:00.000000

"""

from typing import Sequence, Union
from uuid import UUID, uuid4

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CABIN_ID = "c0a1b000-0000-4000-8000-000000000001"
DEVICE_TYPES = {
    "scale": ("d0000001-0000-4000-8000-000000000001", "Balança de bioimpedância"),
    "oximeter": ("d0000002-0000-4000-8000-000000000002", "Oxímetro"),
    "blood_pressure_ecg": ("d0000003-0000-4000-8000-000000000003", "Pressão de braço"),
    "blood_pressure_wrist": ("d0000004-0000-4000-8000-000000000004", "Pressão de pulso"),
}
KIND_DRIVERS = {
    "scale": ("ble_rm_rd2504a", "rm_rd2504a_ffb2"),
    "oximeter": ("ble_oximeter", "pc60nw"),
    "blood_pressure_ecg": ("ble_hem7530", "hem7530"),
    "blood_pressure_wrist": ("ble_hem6161", "hem6161"),
}
READING_TABLES = (
    "scale_measurements",
    "oximeter_readings",
    "blood_pressure_readings",
    "form_submissions",
)


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


def _rename_index(old: str, new: str) -> None:
    op.execute(sa.text(f'ALTER INDEX IF EXISTS "{old}" RENAME TO "{new}"'))


def _replace_user_fk(table: str) -> None:
    op.drop_constraint(f"{table}_person_id_fkey", table, type_="foreignkey")
    op.alter_column(table, "person_id", new_column_name="user_id")
    _rename_index(f"ix_{table}_person_id", f"ix_{table}_user_id")
    op.create_foreign_key(
        f"{table}_user_id_fkey",
        table,
        "users",
        ["user_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def _as_uuid(value: object) -> UUID:
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def _backfill_sessions(bind: sa.Connection, cabin_id: str) -> None:
    grouped = bind.execute(
        sa.text(
            """
            SELECT user_id, visit_id, MIN(created_at) AS started_at, MAX(created_at) AS ended_at
            FROM (
                SELECT user_id, visit_id, created_at FROM scale_measurements WHERE visit_id IS NOT NULL
                UNION ALL
                SELECT user_id, visit_id, created_at FROM oximeter_readings WHERE visit_id IS NOT NULL
                UNION ALL
                SELECT user_id, visit_id, created_at FROM blood_pressure_readings WHERE visit_id IS NOT NULL
                UNION ALL
                SELECT user_id, visit_id, created_at FROM form_submissions WHERE visit_id IS NOT NULL
            ) readings
            GROUP BY user_id, visit_id
            """
        )
    ).mappings()
    used: set[str] = set()
    cabin_uuid = _as_uuid(cabin_id)
    for row in grouped:
        visit_uuid = _as_uuid(row["visit_id"])
        session_uuid = visit_uuid if str(visit_uuid) not in used else uuid4()
        used.add(str(session_uuid))
        user_uuid = _as_uuid(row["user_id"])
        bind.execute(
            sa.text(
                """
                INSERT INTO sessions (
                    id, user_id, cabin_id, status, started_at, completed_at, created_at, updated_at
                )
                VALUES (
                    :id, :user_id, :cabin_id, 'completed', :started_at, :ended_at, :started_at, :ended_at
                )
                """
            ),
            {
                "id": session_uuid,
                "user_id": user_uuid,
                "cabin_id": cabin_uuid,
                "started_at": row["started_at"],
                "ended_at": row["ended_at"],
            },
        )
        for table in READING_TABLES:
            bind.execute(
                sa.text(
                    f"UPDATE {table} SET session_id = :session_id "
                    "WHERE user_id = :user_id AND visit_id = :visit_id"
                ),
                {"session_id": session_uuid, "user_id": user_uuid, "visit_id": visit_uuid},
            )

    for table in READING_TABLES:
        orphans = bind.execute(
            sa.text(f"SELECT id, user_id, created_at FROM {table} WHERE visit_id IS NULL")
        ).mappings()
        for row in orphans:
            session_uuid = uuid4()
            user_uuid = _as_uuid(row["user_id"])
            bind.execute(
                sa.text(
                    """
                    INSERT INTO sessions (
                        id, user_id, cabin_id, status, started_at, completed_at, created_at, updated_at
                    )
                    VALUES (
                        :id, :user_id, :cabin_id, 'completed', :started_at, :started_at, :started_at, :started_at
                    )
                    """
                ),
                {
                    "id": session_uuid,
                    "user_id": user_uuid,
                    "cabin_id": cabin_uuid,
                    "started_at": row["created_at"],
                },
            )
            bind.execute(
                sa.text(f"UPDATE {table} SET session_id = :session_id WHERE id = :id"),
                {"session_id": session_uuid, "id": _as_uuid(row["id"])},
            )


def upgrade() -> None:
    created_at, updated_at = _timestamps()
    op.create_table(
        "cabins",
        sa.Column("description", sa.String(length=160), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("modules", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.PrimaryKeyConstraint("id"),
    )
    created_at, updated_at = _timestamps()
    op.create_table(
        "device_types",
        sa.Column("slug", sa.String(length=40), nullable=False),
        sa.Column("description", sa.String(length=160), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug", name="uq_device_types_slug"),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO cabins (id, description, is_active, modules, created_at, updated_at)
            VALUES (
                :id,
                'Cabine',
                true,
                '["questionario", "bioimpedancia", "oximetria", "pressao", "temperatura"]'::jsonb,
                now(),
                now()
            )
            """
        ).bindparams(id=UUID(CABIN_ID))
    )
    for slug, (type_id, description) in DEVICE_TYPES.items():
        op.execute(
            sa.text(
                """
                INSERT INTO device_types (id, slug, description, created_at, updated_at)
                VALUES (:id, :slug, :description, now(), now())
                """
            ).bindparams(id=UUID(type_id), slug=slug, description=description)
        )

    op.rename_table("users", "admins")
    _rename_index("ix_users_email", "ix_admins_email")

    op.rename_table("people", "users")
    _rename_index("ix_people_registration", "ix_users_registration")
    for table in READING_TABLES:
        _replace_user_fk(table)

    bind = op.get_bind()
    missing = bind.execute(sa.text("SELECT count(*) FROM users WHERE registration IS NULL")).scalar_one()
    if missing:
        raise RuntimeError(
            "A migration parou: existe usuário do totem sem matrícula. "
            "Preencha registration antes de tornar a coluna obrigatória."
        )
    op.alter_column("users", "registration", existing_type=sa.String(length=40), nullable=False)

    created_at, updated_at = _timestamps()
    op.create_table(
        "sessions",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("cabin_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.ForeignKeyConstraint(["cabin_id"], ["cabins.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('open', 'completed', 'abandoned')",
            name="sessions_status",
        ),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_cabin_id", "sessions", ["cabin_id"])
    op.create_index(
        "uq_sessions_one_open",
        "sessions",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )

    for table in READING_TABLES:
        op.add_column(table, sa.Column("session_id", sa.Uuid(), nullable=True))
    _backfill_sessions(bind, CABIN_ID)
    for table in READING_TABLES:
        op.alter_column(table, "session_id", nullable=False)
        op.create_index(f"ix_{table}_session_id", table, ["session_id"])
        op.create_foreign_key(
            f"{table}_session_id_fkey",
            table,
            "sessions",
            ["session_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.drop_index(f"ix_{table}_visit_id", table_name=table)
        op.drop_column(table, "visit_id")

    created_at, updated_at = _timestamps()
    op.create_table(
        "devices",
        sa.Column("cabin_id", sa.Uuid(), nullable=True),
        sa.Column("device_type_id", sa.Uuid(), nullable=False),
        sa.Column("description", sa.String(length=120), nullable=False),
        sa.Column("address", sa.String(length=120), nullable=False),
        sa.Column("adapter", sa.String(length=40), nullable=False),
        sa.Column("parser", sa.String(length=60), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("paired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        created_at,
        updated_at,
        sa.ForeignKeyConstraint(["cabin_id"], ["cabins.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["device_type_id"], ["device_types.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("address", name="uq_devices_address"),
    )
    op.create_index("ix_devices_cabin_id", "devices", ["cabin_id"])
    op.create_index("ix_devices_device_type_id", "devices", ["device_type_id"])
    scale_type_id = DEVICE_TYPES["scale"][0]
    op.execute(
        sa.text(
            """
            INSERT INTO devices (
                id, cabin_id, device_type_id, description, address, adapter, parser,
                is_active, is_default, paired_at, created_at, updated_at
            )
            SELECT
                id, :cabin_id, :type_id, name, address, adapter, parser,
                is_active, is_default, created_at, created_at, updated_at
            FROM scales
            """
        ).bindparams(cabin_id=UUID(CABIN_ID), type_id=UUID(scale_type_id))
    )
    for slug, (adapter, parser) in KIND_DRIVERS.items():
        if slug == "scale":
            continue
        type_id = DEVICE_TYPES[slug][0]
        op.execute(
            sa.text(
                """
                INSERT INTO devices (
                    id, cabin_id, device_type_id, description, address, adapter, parser,
                    is_active, is_default, paired_at, created_at, updated_at
                )
                SELECT
                    p.id, :cabin_id, :type_id, p.name, p.address, :adapter, :parser,
                    p.is_active,
                    p.is_active AND NOT EXISTS (
                        SELECT 1 FROM devices d
                        WHERE d.cabin_id = :cabin_id
                          AND d.device_type_id = :type_id
                          AND d.is_default
                    ),
                    p.paired_at, p.created_at, p.updated_at
                FROM paired_devices p
                WHERE p.kind = :slug
                  AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.address = p.address)
                """
            ).bindparams(
                cabin_id=UUID(CABIN_ID),
                type_id=UUID(type_id),
                adapter=adapter,
                parser=parser,
                slug=slug,
            )
        )
    op.execute(
        sa.text(
            """
            UPDATE devices
            SET is_default = false
            WHERE is_default
              AND id NOT IN (
                SELECT DISTINCT ON (cabin_id, device_type_id) id
                FROM devices
                WHERE is_default
                ORDER BY cabin_id, device_type_id, created_at
              )
            """
        )
    )
    op.execute(sa.text("UPDATE devices SET is_default = false WHERE is_default AND NOT is_active"))
    op.create_check_constraint(
        "devices_default_requires_cabin",
        "devices",
        "NOT is_default OR (is_active AND cabin_id IS NOT NULL)",
    )
    op.create_index(
        "uq_devices_one_default_per_type",
        "devices",
        ["cabin_id", "device_type_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )

    op.drop_constraint("scale_measurements_scale_id_fkey", "scale_measurements", type_="foreignkey")
    op.alter_column("scale_measurements", "scale_id", new_column_name="device_id")
    _rename_index("ix_scale_measurements_scale_id", "ix_scale_measurements_device_id")
    op.create_foreign_key(
        "scale_measurements_device_id_fkey",
        "scale_measurements",
        "devices",
        ["device_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.add_column("scale_measurements", sa.Column("device_address", sa.String(length=120), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE scale_measurements AS reading
            SET device_address = device.address
            FROM devices AS device
            WHERE reading.device_id = device.id
            """
        )
    )
    for table in ("oximeter_readings", "blood_pressure_readings"):
        op.add_column(table, sa.Column("device_id", sa.Uuid(), nullable=True))
        op.create_index(f"ix_{table}_device_id", table, ["device_id"])
        op.create_foreign_key(
            f"{table}_device_id_fkey",
            table,
            "devices",
            ["device_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        op.execute(
            sa.text(
                f"""
                UPDATE {table} AS reading
                SET device_id = device.id
                FROM devices AS device
                WHERE reading.device_address IS NOT NULL
                  AND upper(btrim(reading.device_address)) = upper(btrim(device.address))
                """
            )
        )

    op.drop_table("paired_devices")
    op.drop_table("scales")
    op.drop_table("fhir_patients")


def downgrade() -> None:
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
    op.create_index("ix_fhir_patients_fhir_id", "fhir_patients", ["fhir_id"], unique=True)

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
    op.create_index("ix_scales_address", "scales", ["address"], unique=True)
    op.execute(
        sa.text(
            """
            INSERT INTO scales (id, name, adapter, address, parser, is_active, is_default, created_at, updated_at)
            SELECT device.id, device.description, device.adapter, device.address, device.parser,
                   device.is_active, device.is_default, device.created_at, device.updated_at
            FROM devices AS device
            JOIN device_types AS kind ON kind.id = device.device_type_id
            WHERE kind.slug = 'scale'
            """
        )
    )

    op.create_table(
        "paired_devices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("address", sa.String(length=40), nullable=False),
        sa.Column("paired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kind"),
    )
    op.execute(
        sa.text(
            """
            INSERT INTO paired_devices (id, kind, name, address, paired_at, is_active, created_at, updated_at)
            SELECT DISTINCT ON (kind.slug)
                device.id, kind.slug, device.description, left(device.address, 40),
                device.paired_at, device.is_active, device.created_at, device.updated_at
            FROM devices AS device
            JOIN device_types AS kind ON kind.id = device.device_type_id
            WHERE kind.slug <> 'scale'
            ORDER BY kind.slug, device.is_default DESC, device.paired_at DESC
            """
        )
    )

    op.drop_constraint("scale_measurements_device_id_fkey", "scale_measurements", type_="foreignkey")
    op.alter_column("scale_measurements", "device_id", new_column_name="scale_id")
    _rename_index("ix_scale_measurements_device_id", "ix_scale_measurements_scale_id")
    op.create_foreign_key(
        "scale_measurements_scale_id_fkey",
        "scale_measurements",
        "scales",
        ["scale_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        sa.text(
            """
            UPDATE scale_measurements
            SET scale_id = NULL
            WHERE scale_id IS NOT NULL
              AND scale_id NOT IN (SELECT id FROM scales)
            """
        )
    )
    op.drop_column("scale_measurements", "device_address")
    for table in ("oximeter_readings", "blood_pressure_readings"):
        op.drop_constraint(f"{table}_device_id_fkey", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_device_id", table_name=table)
        op.drop_column(table, "device_id")

    op.drop_index("uq_devices_one_default_per_type", table_name="devices")
    op.drop_table("devices")
    op.drop_table("device_types")

    for table in READING_TABLES:
        op.add_column(table, sa.Column("visit_id", sa.Uuid(), nullable=True))
        op.execute(sa.text(f"UPDATE {table} SET visit_id = session_id"))
        op.drop_constraint(f"{table}_session_id_fkey", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_session_id", table_name=table)
        op.drop_column(table, "session_id")
        op.create_index(f"ix_{table}_visit_id", table, ["visit_id"])

    op.drop_index("uq_sessions_one_open", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("cabins")

    op.alter_column("users", "registration", existing_type=sa.String(length=40), nullable=True)
    for table in READING_TABLES:
        op.drop_constraint(f"{table}_user_id_fkey", table, type_="foreignkey")
        op.alter_column(table, "user_id", new_column_name="person_id")
        _rename_index(f"ix_{table}_user_id", f"ix_{table}_person_id")

    op.rename_table("users", "people")
    _rename_index("ix_users_registration", "ix_people_registration")
    for table in READING_TABLES:
        op.create_foreign_key(
            f"{table}_person_id_fkey",
            table,
            "people",
            ["person_id"],
            ["id"],
            ondelete="CASCADE",
        )

    op.rename_table("admins", "users")
    _rename_index("ix_admins_email", "ix_users_email")
