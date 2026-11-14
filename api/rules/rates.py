"""Append-only versioning for demo tariff rates."""

from datetime import date
from decimal import Decimal

from psycopg import Connection
from psycopg.types.json import Jsonb

from contracts.models import ChangeEvent

SCHEMA = """
CREATE TABLE IF NOT EXISTS tariff_rate_versions (
    version integer PRIMARY KEY,
    change_id text UNIQUE,
    change_event jsonb
);
CREATE TABLE IF NOT EXISTS tariff_rate_entries (
    version integer REFERENCES tariff_rate_versions,
    hs6 text,
    country text,
    measure text,
    effective_from date,
    rate numeric NOT NULL CHECK (rate BETWEEN 0 AND 1),
    basis text NOT NULL,
    PRIMARY KEY (version, hs6, country, measure, effective_from)
);
"""
BASE_VERSION = 11
METALS_MEASURE = "s232_metals"


def initialize_rates(connection: Connection) -> None:
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(2961202611)")
        connection.execute(SCHEMA)
        inserted = connection.execute(
            "INSERT INTO tariff_rate_versions (version) VALUES (%s) "
            "ON CONFLICT DO NOTHING RETURNING version",
            (BASE_VERSION,),
        ).fetchone()
        if inserted:
            rows = connection.execute(
                """
                INSERT INTO tariff_rate_entries
                    (version, hs6, country, measure, effective_from, rate, basis)
                SELECT %s, hs6, '', measure, effective_from, rate, basis
                FROM tariff_rates_baseline
                """,
                (BASE_VERSION,),
            ).rowcount
            if not rows:
                raise ValueError("Seed baseline tariff rates before initializing version 11")


def apply_change(connection: Connection, change: ChangeEvent) -> int:
    event = change.model_dump(mode="json")
    with connection.transaction():
        initialize_rates(connection)
        existing = connection.execute(
            "SELECT version, change_event FROM tariff_rate_versions WHERE change_id = %s",
            (change.id,),
        ).fetchone()
        if existing:
            version, previous_event = existing
            if previous_event != event:
                raise ValueError(f"Tariff change {change.id} already has a different payload")
            return version

        version = connection.execute(
            "SELECT max(version) + 1 FROM tariff_rate_versions"
        ).fetchone()[0]
        connection.execute(
            "INSERT INTO tariff_rate_versions VALUES (%s, %s, %s)",
            (version, change.id, Jsonb(event)),
        )
        # Scope entries are deltas. Reading an older version never sees a later delta.
        measure = METALS_MEASURE if change.measure.startswith("Illustrative Section 232") else change.measure
        with connection.cursor() as cursor:
            cursor.executemany(
                "INSERT INTO tariff_rate_entries VALUES (%s, %s, %s, %s, %s, %s, %s)",
                [
                    (version, hs6, country, measure, change.effective_date,
                     Decimal(str(change.new_rate)), change.basis)
                    for hs6 in sorted(set(change.hts_scope))
                    for country in sorted(set(change.countries or [""]))
                ],
            )
    return version


def read_rate(
    connection: Connection,
    version: int,
    hs6: str,
    country: str,
    on_date: date,
    measure: str = METALS_MEASURE,
) -> Decimal | None:
    row = connection.execute(
        """
        SELECT rate FROM tariff_rate_entries
        WHERE version <= %s AND hs6 = %s AND country IN ('', %s)
          AND measure = %s AND effective_from <= %s
        ORDER BY effective_from DESC, (country <> '') DESC, version DESC
        LIMIT 1
        """,
        (version, hs6, country, measure, on_date),
    ).fetchone()
    return row[0] if row else None
