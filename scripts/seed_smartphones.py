"""Load the smartphone walkthrough into a fresh, dedicated PostgreSQL schema."""

import os
from datetime import date

import psycopg
import pymupdf
from psycopg.types.json import Jsonb

from api.loader.seed import SCHEMA
from api.routes.intake import REVIEWS_SCHEMA, SCHEMA as INTAKE_SCHEMA
from api.routes.store import save_action, save_evidence
from api.rules.rates import METALS_MEASURE, apply_change, initialize_rates
from contracts.models import Action, ChangeEvent, Citation, EvidenceItem

PARTS = [
    ("AP-X1", "Application processor X1", "854231", 40, 42),
    ("AP-X2", "Application processor X2", "854231", 52, 56),
    ("RAM-L8", "LPDDR memory 8 GB", "854232", 18, 19),
    ("UFS-256", "UFS storage 256 GB", "852351", 30, 31),
    ("OLED-61", "6.1-inch OLED display", "852412", 22, 24),
    ("OLED-67", "6.7-inch OLED display", "852412", 28, 30),
    ("BAT-45", "4,500 mAh battery pack", "850760", 9, 10),
]
UPDATES = [
    ("PH-101", "Battery pack tariff update", ["850760"], "2027-01-10", 0.08),
    ("PH-102", "OLED display tariff update", ["852412"], "2027-02-01", 0.15),
    ("PH-103", "Processor, memory and storage tariff update", ["854231", "854232", "852351"], "2027-03-01", 0.10),
]


def source_document(connection, doc_id, title, kind, lines, *, scan=False):
    with pymupdf.open() as pdf:
        page = pdf.new_page(width=612, height=792)
        page.draw_rect(pymupdf.Rect(0, 0, 612, 118), color=None, fill=(0.10, 0.19, 0.22))
        page.insert_text((48, 45), "KEYSTONE  /  SMARTPHONE SOURCING", fontsize=11, color=(0.8, 0.9, 0.9))
        page.insert_text((48, 84), title, fontsize=22, color=(1, 1, 1))
        page.insert_text((48, 150), "Fictional training document", fontsize=11)
        citations = {}
        for index, (key, text) in enumerate(lines):
            y = 193 + index * 42
            page.insert_text((48, y), text, fontsize=13)
            rect = page.search_for(text)[0]
            box = (rect.x0 / 612, rect.y0 / 792, rect.x1 / 612, rect.y1 / 792)
            citations[key] = [Citation(doc_id=doc_id, page=1, bbox=box, quote=text)]
        content = page.get_pixmap(dpi=140).tobytes("jpeg") if scan else pdf.tobytes()
    extension, media = ("jpg", "image/jpeg") if scan else ("pdf", "application/pdf")
    filename = f"{doc_id}.{extension}"
    connection.execute(
        "INSERT INTO intake_documents VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
        (doc_id, filename, media, content),
    )
    connection.execute(
        """INSERT INTO intake_reviews (doc_id,filename,media_type,kind,summary,review)
           VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        (doc_id, filename, media, kind, title, Jsonb([])),
    )
    return citations


def seed_smartphones(connection):
    with connection.transaction():
        connection.execute(SCHEMA.read_text(encoding="utf-8"))
        connection.execute(INTAKE_SCHEMA)
        connection.execute(REVIEWS_SCHEMA)
        initialize_existing = connection.execute("SELECT to_regclass('tariff_rate_versions')").fetchone()[0]
        if initialize_existing and connection.execute(
            "SELECT 1 FROM tariff_rate_versions WHERE change_id IS NOT NULL AND NOT (change_id = ANY(%s))",
            ([item[0] for item in UPDATES],),
        ).fetchone():
            raise ValueError("Use a fresh schema for the smartphone walkthrough")
        with connection.cursor() as cursor:
            cursor.executemany("INSERT INTO suppliers VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING", [
                ("PHONE-KR", "Hanul Mobile Components", "KR", "Suwon"),
                ("PHONE-US", "Redwood Silicon Works", "US", "Austin"),
            ])
            cursor.executemany("INSERT INTO products VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING", [
                ("PHONE-ONE", "Keystone Phone One", 699, 200_000),
                ("PHONE-PRO", "Keystone Phone Pro", 999, 120_000),
            ])
            for index, (part, name, hs6, cost, alternate) in enumerate(PARTS, 1):
                cursor.execute(
                    "INSERT INTO parts VALUES (%s,%s,%s,%s,'Electronics',0,'each','unverified') ON CONFLICT DO NOTHING",
                    (part, name, hs6, hs6 + "0000"),
                )
                cursor.executemany("INSERT INTO supplier_parts VALUES (%s,%s,%s,'FOB',30,%s) ON CONFLICT DO NOTHING", [
                    ("PHONE-KR", part, cost, True), ("PHONE-US", part, alternate, False),
                ])
                cursor.execute("INSERT INTO bom_lines VALUES (%s,%s,1) ON CONFLICT DO NOTHING",
                               ("PHONE-PRO" if part in {"AP-X2", "OLED-67"} else "PHONE-ONE", part))
                quantity = 20_000 if part in {"AP-X2", "OLED-67"} else 35_000
                cursor.execute(
                    "INSERT INTO purchase_orders VALUES (%s,1,'PHONE-KR',%s,%s,%s,%s,'2027-03-01','2027-04-10','open') ON CONFLICT DO NOTHING",
                    (f"PH-PO-{index:02}", part, quantity, cost, quantity * cost),
                )
                cursor.execute(
                    "INSERT INTO tariff_rates_baseline VALUES (%s,%s,0,'full_customs_value','2026-01-01') ON CONFLICT DO NOTHING",
                    (hs6, METALS_MEASURE),
                )
                award = f"PH-AWARD-{index:02}"
                cursor.execute(
                    """INSERT INTO decisions VALUES (%s,'supplier_award',%s,'PHONE-KR',
                       'Compare the quoted annual cost after the tariff update.','2026-11-01','Sourcing') ON CONFLICT DO NOTHING""",
                    (award, part),
                )
                cursor.execute(
                    "INSERT INTO assumptions VALUES (%s,%s,%s,'0','PHONE-BASE') ON CONFLICT DO NOTHING",
                    (award + "-RATE", award, f"s232_rate:{hs6}:KR"),
                )
        initialize_rates(connection)
        for doc_id, title, scope, effective, rate in UPDATES:
            citations = source_document(connection, doc_id, title, "bulletin", [
                ("measure", f"Modeled Section 232 duty: 0% to {rate:.0%}"),
                ("old_rate", "Previous modeled duty: 0%"),
                ("new_rate", f"New modeled duty: {rate:.0%}"),
                ("effective_date", f"Effective date: {effective}"),
                ("hts_scope", f"HTS headings: {', '.join(scope)}"),
                ("basis", "Assessment basis: full customs value"),
                ("countries", "Affected origin: South Korea"),
            ])
            apply_change(connection, ChangeEvent(
                id=doc_id, measure=f"{title} (modeled Section 232)", hts_scope=scope, countries=["KR"],
                old_rate=0, new_rate=rate, basis="full_customs_value", effective_date=date.fromisoformat(effective),
                citations=citations["measure"], field_citations=citations,
            ))
        for part, label, batch in [("UFS-256", "UFS storage 256 GB", "RW-256-A"), ("RAM-L8", "LPDDR memory 8 GB", "RW-L8-A")]:
            doc_id = f"REDWOOD-{part}-SCAN"
            citations = source_document(connection, doc_id, "Redwood Origin Declaration", "supplier_document", [
                ("supplier_name", "Supplier: Redwood Silicon Works"),
                ("part_number", f"Part: {part} / {label}"),
                ("batch_id", f"Lot: {batch}"),
                ("country_of_origin", "Declared origin: United States"),
                ("signature", "Signed: Avery Lin, Supplier Quality"),
            ], scan=True)
            save_evidence(connection, EvidenceItem(
                supplier_id="PHONE-US", part_no=part, batch_id=batch, doc_id=doc_id,
                kind="component_origin_declaration", confidence=1,
                fields={"part_number": part, "country_of_origin": "US"},
                bbox_refs=citations["part_number"], field_citations=citations,
            ))
        save_action(connection, Action(
            id="PH-ACTION-01", rank=1, type="request_evidence", part_ids=["AP-X1"], usd_at_stake=0,
            title="Request processor qualification records",
            why="Confirm firmware compatibility and available volume before changing suppliers.",
            draft_email="Please share the AP-X1 origin declaration, qualification results, and available production volume.",
        ))


if __name__ == "__main__":
    with psycopg.connect(os.environ["DATABASE_URL"]) as database:
        seed_smartphones(database)
