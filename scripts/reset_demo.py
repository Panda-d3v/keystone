"""T41 - Put the demo database back to its freshly seeded state.

    DATABASE_URL=... python -m scripts.reset_demo

or, on a demo server started with KEYSTONE_ALLOW_RESET=1:

    curl -X POST http://localhost:8000/admin/reset

Everything the demo creates at runtime is cleared in one transaction:
uploads and their stored bytes, extracted changes and rate versions,
evidence records, proposed and submitted actions, and the audit chain.
Identity counters restart, so the next bulletin is CE-0007 again and the
next submitted request is D-2026-044 again. The procurement seed data
(parts, suppliers, POs, BOMs, decisions) is then reloaded from the demo
pack. The model replay cache in api/agents/cache is not touched, so the
reset demo still runs with no network.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts.seed_demo import seed_demo  # noqa: E402

DEMO_PACK = ROOT / "docs" / "reference" / "keystone-demo-pack.zip"
RESET_LOCK = 2961202699

# Tables written while the demo runs (T40 intake, T25 actions and V5
# declines, T26 audit, T11 rate versions, T14 evidence). Missing ones are skipped, so a reset
# works on a database that has not been used yet.
RUNTIME_TABLES = (
    "intake_action_keys",
    "supplier_document_intake",
    "intake_documents",
    "bulletin_intake",
    "sent_actions",
    "declined_actions",
    "proposed_actions",
    "evidence_records",
    "evidence_scopes",
    "audit_events",
    "tariff_rate_entries",
    "tariff_rate_versions",
)


def reset_demo(connection: psycopg.Connection, source: Path = DEMO_PACK) -> dict:
    """Clear runtime tables and reseed. Returns what was done, for logs and the API."""
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(%s)", (RESET_LOCK,))
        present = [t for t in RUNTIME_TABLES
                   if connection.execute("SELECT to_regclass(%s)", (t,)).fetchone()[0] is not None]
        if present:
            connection.execute(sql.SQL("TRUNCATE {} RESTART IDENTITY CASCADE").format(
                sql.SQL(", ").join(map(sql.Identifier, present))))
        counts = seed_demo(connection, source)
    return {"cleared_tables": present, "seeded": counts}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--demo-pack", type=Path, default=DEMO_PACK)
    args = parser.parse_args(argv)
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        parser.error("set DATABASE_URL to the demo database")
    with psycopg.connect(dsn) as connection:
        print(json.dumps(reset_demo(connection, args.demo_pack), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
