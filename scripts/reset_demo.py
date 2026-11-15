"""Restore an isolated Keystone demo database to its initial seeded state."""

import argparse
import json
import os
from pathlib import Path

import psycopg
from psycopg import sql

from api.loader.seed import TABLES
from scripts.seed_demo import seed_demo

DEMO_PACK = Path("docs/reference/keystone-demo-pack.zip")
RUNTIME_TABLES = {
    "audit_events", "bulletin_intake", "declined_actions", "evidence_records",
    "evidence_scopes", "intake_action_keys", "intake_documents", "proposed_actions",
    "sent_actions", "supplier_document_intake", "tariff_rate_entries", "tariff_rate_versions",
}


def reset_demo(connection: psycopg.Connection, archive: Path = DEMO_PACK) -> dict[str, int]:
    with connection.transaction():
        # Match the intake, seed, rate, store and audit lock order before truncating.
        for lock in (2961202640, 2961202602, 2961202611, 2961202615, 2961202626):
            connection.execute("SELECT pg_advisory_xact_lock(%s)", (lock,))
        schema = connection.execute("SELECT current_schema()").fetchone()[0]
        present = connection.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = %s ORDER BY tablename", (schema,),
        ).fetchall()
        tables = [
            sql.Identifier(schema, name) for (name,) in present
            if name in TABLES or name in RUNTIME_TABLES
        ]
        if tables:
            connection.execute(sql.SQL("TRUNCATE {} RESTART IDENTITY").format(
                sql.SQL(", ").join(tables)
            ))
        return seed_demo(connection, archive)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo-pack", type=Path, default=DEMO_PACK)
    args = parser.parse_args()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        parser.error("set DATABASE_URL to your isolated demo database")
    with psycopg.connect(dsn) as connection:
        print(json.dumps(reset_demo(connection, args.demo_pack), indent=2))


if __name__ == "__main__":
    main()
