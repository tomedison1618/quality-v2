"""
One-time migration utility to copy data from the legacy MySQL database
into the new PostgreSQL schema.

By default it looks for the legacy env file in the sibling quality-v2 project:
    ../quality-v2/backend/.env
Override via the SRC_ENV_PATH environment variable if needed.

Usage (from the backend directory):
    python migrate_mysql_to_postgres.py
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
import os
from pathlib import Path
from typing import Callable, List, Sequence

try:
    import mysql.connector  # type: ignore
except ModuleNotFoundError as exc:  # pragma: no cover
    raise SystemExit(
        "mysql-connector-python is required for the migration.\n"
        "Install it in the virtualenv with:\n"
        "    pip install mysql-connector-python\n"
    ) from exc

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DEFAULT_SRC_ENV = PROJECT_ROOT.with_name("quality-v2") / "backend" / ".env"
DEFAULT_DEST_ENV = BACKEND_DIR / ".env"


def load_env(path: Path) -> dict[str, str]:
    if not path.exists():
        raise SystemExit(f"Environment file not found: {path}")
    values = dotenv_values(path)
    if not values:
        raise SystemExit(f"Environment file is empty: {path}")
    return {k: v for k, v in values.items() if v is not None}


def to_bool(value) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes", "y"}
    return bool(value)


@dataclass
class TableMigration:
    name: str
    columns: Sequence[str]
    transform: Callable[[dict], Sequence] | None = None
    truncate_first: bool = False

    def sql_insert(self) -> str:
        col_list = ", ".join(self.columns)
        placeholders = ", ".join(["%s"] * len(self.columns))
        return f"INSERT INTO {self.name} ({col_list}) VALUES ({placeholders})"


def reset_identity(conn: psycopg.Connection, table: str, pk_column: str) -> None:
    query = sql.SQL(
        """
        SELECT setval(
            pg_get_serial_sequence({table_literal}, {pk_literal}),
            COALESCE((SELECT MAX({pk_ident}) FROM {table_ident}), 0),
            true
        )
        """
    ).format(
        table_literal=sql.Literal(table),
        pk_literal=sql.Literal(pk_column),
        pk_ident=sql.Identifier(pk_column),
        table_ident=sql.Identifier(table),
    )
    with conn.cursor() as cur:
        cur.execute(query)


def main() -> None:
    if len(sys.argv) > 1:
        src_env_path = Path(sys.argv[1])
    else:
        src_env_path = Path(
            os.environ.get("SRC_ENV_PATH", DEFAULT_SRC_ENV)  # type: ignore[arg-type]
        )
    dest_env_path = Path(
        os.environ.get("DEST_ENV_PATH", DEFAULT_DEST_ENV)  # type: ignore[arg-type]
    )

    print(f"Reading MySQL credentials from: {src_env_path}")
    src_env = load_env(src_env_path)
    print(f"Reading PostgreSQL credentials from: {dest_env_path}")
    dest_env = load_env(dest_env_path)

    src_conn = mysql.connector.connect(
        host=src_env.get("DB_HOST", "localhost"),
        user=src_env.get("DB_USER"),
        password=src_env.get("DB_PASSWORD"),
        database=src_env.get("DB_NAME"),
    )
    dest_conn = psycopg.connect(
        host=dest_env.get("DB_HOST", "localhost"),
        port=int(dest_env.get("DB_PORT", "5432")),
        user=dest_env.get("DB_USER"),
        password=dest_env.get("DB_PASSWORD"),
        dbname=dest_env.get("DB_NAME"),
    )

    tables: List[TableMigration] = [
        TableMigration(
            name="model_numbers",
            columns=["model_id", "model_type", "description", "part_number", "is_active"],
            truncate_first=True,
            transform=lambda row: (
                row["model_id"],
                row["model_type"],
                row["description"],
                row["part_number"],
                to_bool(row["is_active"]),
            ),
        ),
        TableMigration(
            name="checklist_master_items",
            columns=["item_id", "item_text", "item_order", "is_active"],
            truncate_first=True,
            transform=lambda row: (
                row["item_id"],
                row["item_text"],
                row["item_order"],
                to_bool(row["is_active"]),
            ),
        ),
        TableMigration(
            name="shipments",
            columns=["id", "customer_name", "job_number", "shipping_date", "qc_name", "status"],
            truncate_first=True,
            transform=lambda row: (
                row["id"],
                row["customer_name"],
                row["job_number"],
                row["shipping_date"],
                row["qc_name"],
                row["status"],
            ),
        ),
        TableMigration(
            name="users",
            columns=["id", "username", "password_hash", "role", "is_active", "created_at"],
            truncate_first=True,
            transform=lambda row: (
                row["id"],
                row["username"],
                row["password_hash"],
                row.get("role") or "user",
                to_bool(row.get("is_active", True)),
                row.get("created_at"),
            ),
        ),
        TableMigration(
            name="shipped_units",
            columns=[
                "unit_id",
                "shipment_id",
                "model_type",
                "part_number",
                "serial_number",
                "original_serial_number",
                "first_test_pass",
                "failed_equipment",
                "retest_reason",
            ],
            truncate_first=True,
            transform=lambda row: (
                row["unit_id"],
                row["shipment_id"],
                row["model_type"],
                row["part_number"],
                row["serial_number"],
                row.get("original_serial_number"),
                to_bool(row.get("first_test_pass")),
                row.get("failed_equipment"),
                row.get("retest_reason"),
            ),
        ),
        TableMigration(
            name="shipment_checklist_responses",
            columns=[
                "response_id",
                "shipment_id",
                "item_id",
                "status",
                "completed_by",
                "completion_date",
                "comments",
            ],
            truncate_first=True,
            transform=lambda row: (
                row["response_id"],
                row["shipment_id"],
                row["item_id"],
                row["status"],
                row.get("completed_by"),
                row.get("completion_date"),
                row.get("comments"),
            ),
        ),
    ]

    src_cursor = src_conn.cursor(dictionary=True)
    dest_cursor = dest_conn.cursor()

    existing_part_numbers: set[str] = set()
    existing_shipment_ids: set[int] = set()
    existing_checklist_item_ids: set[int] = set()
    max_model_id = 0

    skipped_unit_shipments: set[int] = set()
    skipped_response_shipments: set[int] = set()
    skipped_response_items: set[int] = set()

    try:
        dest_cursor.execute(
            """
            TRUNCATE TABLE
                shipment_checklist_responses,
                shipped_units,
                shipments,
                users,
                checklist_master_items,
                model_numbers
            RESTART IDENTITY CASCADE
            """
        )
        dest_conn.commit()
        print("Cleared target PostgreSQL tables.")

        for table in tables:
            print(f"Migrating table: {table.name}")
            src_cursor.execute(
                f"SELECT {', '.join(table.columns)} FROM {table.name}"
            )
            rows = src_cursor.fetchall()

            if table.name == "model_numbers":
                existing_part_numbers = {
                    row["part_number"] for row in rows if row.get("part_number")
                }
                max_model_id = max(
                    (row["model_id"] for row in rows if row.get("model_id") is not None),
                    default=0,
                )
            elif table.name == "checklist_master_items":
                existing_checklist_item_ids = {
                    row["item_id"] for row in rows if row.get("item_id") is not None
                }
            elif table.name == "shipped_units":
                missing_models: dict[str, tuple] = {}
                for row in rows:
                    part_number = row.get("part_number")
                    if part_number and part_number not in existing_part_numbers:
                        existing_part_numbers.add(part_number)
                        max_model_id += 1
                        missing_models[part_number] = (
                            max_model_id,
                            row.get("model_type") or "Unknown Model",
                            None,
                            part_number,
                            True,
                        )
                if missing_models:
                    print(
                        f"  Found {len(missing_models)} part numbers missing from model_numbers; "
                        "creating placeholder records."
                    )
                    print(f"    Missing part numbers: {', '.join(sorted(missing_models.keys()))}")
                    dest_cursor.executemany(
                        tables[0].sql_insert(),
                        list(missing_models.values()),
                    )
                    dest_conn.commit()
            elif table.name == "shipments":
                existing_shipment_ids = {
                    row["id"] for row in rows if row.get("id") is not None
                }

            if not rows:
                print("  No rows found; skipping.")
                continue

            payload: List[Sequence] = []
            skipped = 0
            for row in rows:
                if table.name == "shipped_units" and row.get("shipment_id") not in existing_shipment_ids:
                    skipped += 1
                    if row.get("shipment_id") is not None:
                        skipped_unit_shipments.add(row["shipment_id"])
                    continue
                if table.name == "shipment_checklist_responses" and (
                    row.get("shipment_id") not in existing_shipment_ids
                    or row.get("item_id") not in existing_checklist_item_ids
                ):
                    skipped += 1
                    if row.get("shipment_id") not in existing_shipment_ids and row.get("shipment_id") is not None:
                        skipped_response_shipments.add(row["shipment_id"])
                    if row.get("item_id") not in existing_checklist_item_ids and row.get("item_id") is not None:
                        skipped_response_items.add(row["item_id"])
                    continue

                payload.append(
                    table.transform(row) if table.transform else tuple(row[col] for col in table.columns)
                )

            if not payload:
                print("  No valid rows to insert after filtering; skipping.")
                continue

            dest_cursor.executemany(table.sql_insert(), payload)
            dest_conn.commit()
            inserted_count = len(payload)
            msg = f"  Inserted {inserted_count} rows."
            if skipped:
                msg += f" Skipped {skipped} rows due to missing references."
            print(msg)

        # Reset sequences so future inserts continue from the latest IDs.
        sequence_map = {
            "model_numbers": "model_id",
            "checklist_master_items": "item_id",
            "shipments": "id",
            "users": "id",
            "shipped_units": "unit_id",
            "shipment_checklist_responses": "response_id",
        }
        for table_name, pk in sequence_map.items():
            reset_identity(dest_conn, table_name, pk)

        dest_conn.commit()

        # Report counts to confirm.
        dest_conn.row_factory = dict_row
        with dest_conn.cursor() as verify_cur:
            print("\nRow counts after migration:")
            for table in sequence_map.keys():
                verify_cur.execute(f"SELECT COUNT(*) AS count FROM {table}")
                count = verify_cur.fetchone()["count"]
                print(f"  {table}: {count}")

        if skipped_unit_shipments:
            print(
                "\nShipped units skipped because the related shipment was missing:"
            )
            print(f"  Shipment IDs: {sorted(skipped_unit_shipments)}")
        if skipped_response_shipments or skipped_response_items:
            print(
                "\nChecklist responses skipped due to missing references:"
            )
            if skipped_response_shipments:
                print(f"  Missing shipment IDs: {sorted(skipped_response_shipments)}")
            if skipped_response_items:
                print(f"  Missing checklist item IDs: {sorted(skipped_response_items)}")
    finally:
        src_cursor.close()
        dest_cursor.close()
        src_conn.close()
        dest_conn.close()


if __name__ == "__main__":
    main()
