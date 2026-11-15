"""Seed procurement data and the expected batch scope of the demo quotes."""

import argparse
import json
import os
from pathlib import Path

import psycopg

from api.loader.seed import load_seed
from api.routes.store import record_expected_batches

DEMO_QUOTE_BATCHES = {
    ("S001", "MF-8413-005"): {"H26-3318", "H26-3322"},
    ("S007", "MF-8413-005"): {"SF-24117", "SF-24121"},
}


def seed_demo(connection: psycopg.Connection, source: Path) -> dict[str, int]:
    with connection.transaction():
        counts = load_seed(connection, source)
        for (supplier_id, part_no), batches in DEMO_QUOTE_BATCHES.items():
            record_expected_batches(connection, supplier_id, part_no, batches)
        return counts


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--demo-pack", type=Path, default=Path("docs/reference/keystone-demo-pack.zip"),
    )
    args = parser.parse_args()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        parser.error("set DATABASE_URL to the demo database")
    with psycopg.connect(dsn) as connection:
        print(json.dumps(seed_demo(connection, args.demo_pack), indent=2))
