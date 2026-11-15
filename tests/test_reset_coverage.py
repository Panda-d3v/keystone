"""T41: every table the API creates is either seed data or cleared by the demo reset."""

import re
from pathlib import Path

from api.loader.seed import TABLES as SEED_TABLES
from scripts.reset_demo import RUNTIME_TABLES

ROOT = Path(__file__).resolve().parents[1]


def test_every_table_is_seed_data_or_reset():
    """A new runtime table must be added to RUNTIME_TABLES, or a reset leaves stale demo data behind."""
    created = set()
    for path in (ROOT / "api").rglob("*"):
        if path.suffix in {".py", ".sql"}:
            created |= set(re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)", path.read_text(encoding="utf-8")))
    assert created, "no table definitions found; the scan is broken"
    uncovered = created - set(SEED_TABLES) - set(RUNTIME_TABLES)
    assert not uncovered, f"add these to scripts/reset_demo.py RUNTIME_TABLES: {sorted(uncovered)}"
