import argparse
import csv
import json
import os
import re
from collections.abc import Iterator
from contextlib import contextmanager
from io import TextIOWrapper
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from zipfile import ZipFile

import psycopg
from psycopg import sql

TABLES = {
    "suppliers": (("supplier_id",), "name country_iso2 city"),
    "parts": (("part_no",), "description hs6 hts10 material metal_pct_by_weight uom"),
    "products": (("sku",), "name list_price_usd annual_units"),
    "supplier_parts": (("supplier_id", "part_no"), "unit_price_usd incoterm lead_time_days is_primary"),
    "bom_lines": (("sku", "part_no"), "qty_per"),
    "purchase_orders": (
        ("po_no", "line"),
        "supplier_id part_no qty unit_price_usd customs_value_usd ship_date est_entry_date status",
    ),
    "tariff_rates_baseline": (("hs6", "measure", "effective_from"), "rate basis"),
    "decisions": (("decision_id",), "type subject chosen_option rationale decided_at owner"),
    "assumptions": (("assumption_id",), "decision_id key assumed_value source_doc_id"),
}
SCHEMA = Path(__file__).resolve().parents[1] / "db" / "001_procurement.sql"


@contextmanager
def open_csv(source: Path, table: str) -> Iterator[TextIOWrapper]:
    filename = f"{table}.csv"
    if source.is_dir():
        with (source / filename).open(encoding="utf-8-sig", newline="") as stream:
            yield stream
    else:
        with ZipFile(source) as archive:
            matches = [name for name in archive.namelist() if Path(name).name == filename]
            if len(matches) != 1:
                raise ValueError(f"Expected one {filename} in {source}")
            with archive.open(matches[0]) as member:
                with TextIOWrapper(member, encoding="utf-8-sig", newline="") as stream:
                    yield stream


def normalized_hts(code: str) -> str:
    return code.strip().replace(".", "")


def hts_status(code: str, hs6: str, known_codes: set[str] | None) -> str:
    code = normalized_hts(code)
    if not re.fullmatch(r"[0-9]{10}", code) or not code.startswith(hs6):
        return "unresolved"
    if known_codes is None:
        return "unverified"
    return "verified" if code in known_codes else "unresolved"


def reference_codes(entries: list[dict]) -> set[str]:
    return {
        normalized_hts(entry["htsno"])
        for entry in entries
        if entry.get("htsno") and re.fullmatch(r"[0-9]{10}", normalized_hts(entry["htsno"]))
    }


def fetch_reference_codes(source: Path) -> set[str]:
    with open_csv(source, "parts") as stream:
        scopes = {row["hs6"] for row in csv.DictReader(stream)}
    codes = set()
    for hs6 in sorted(scopes):
        query = urlencode({"keyword": f"{hs6[:4]}.{hs6[4:]}"})
        with urlopen(f"https://hts.usitc.gov/reststop/search?{query}", timeout=10) as response:
            codes.update(reference_codes(json.load(response)))
    if not codes:
        raise ValueError("The USITC response contained no ten-digit tariff codes")
    return codes


def load_seed(
    connection: psycopg.Connection, source: Path, known_codes: set[str] | None = None
) -> dict[str, int]:
    counts = {}
    unresolved = unverified = 0
    with connection.transaction(), connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(2961202602)")
        cursor.execute(SCHEMA.read_text(encoding="utf-8"))
        for table, (keys, fields) in TABLES.items():
            columns = (*keys, *fields.split())
            insert_columns = (*columns, "hts10_status") if table == "parts" else columns
            identifier_list = sql.SQL(", ").join
            query = sql.SQL(
                "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT ({}) DO UPDATE SET {}"
            ).format(
                sql.Identifier(table),
                identifier_list(map(sql.Identifier, insert_columns)),
                identifier_list(sql.Placeholder() for _ in insert_columns),
                identifier_list(map(sql.Identifier, keys)),
                identifier_list(
                    sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(name), sql.Identifier(name))
                    for name in insert_columns if name not in keys
                ),
            )
            with open_csv(source, table) as stream:
                reader = csv.DictReader(stream)
                if not set(columns).issubset(reader.fieldnames or ()):
                    raise ValueError(f"{table}.csv is missing required columns")
                values = []
                for row in reader:
                    if None in row or any(row[name] is None for name in columns):
                        raise ValueError(f"{table}.csv row {reader.line_num} has the wrong width")
                    value = tuple(row[name] for name in columns)
                    if table == "parts":
                        status = hts_status(row["hts10"], row["hs6"], known_codes)
                        unresolved += status == "unresolved"
                        unverified += status == "unverified"
                        value += (status,)
                    values.append(value)
                cursor.executemany(query, values)
                counts[table] = len(values)
    return {**counts, "unresolved_hts10": unresolved, "unverified_hts10": unverified}


def main() -> None:
    parser = argparse.ArgumentParser(description="Load Keystone demo CSVs into PostgreSQL")
    parser.add_argument("source", type=Path, help="CSV directory or demo ZIP")
    reference = parser.add_mutually_exclusive_group()
    reference.add_argument("--hts-reference", type=Path, help="USITC HTS JSON export")
    reference.add_argument("--live-hts", action="store_true", help="query the current USITC HTS")
    args = parser.parse_args()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        parser.error("set DATABASE_URL to the target PostgreSQL database")
    known_codes = None
    if args.hts_reference is not None:
        entries = json.loads(args.hts_reference.read_text(encoding="utf-8-sig"))
        known_codes = reference_codes(entries)
        if not known_codes:
            parser.error("the HTS reference contains no tariff codes")
    elif args.live_hts:
        known_codes = fetch_reference_codes(args.source)
    with psycopg.connect(dsn) as connection:
        counts = load_seed(connection, args.source, known_codes)
    print(json.dumps(counts, indent=2))


if __name__ == "__main__":
    main()
