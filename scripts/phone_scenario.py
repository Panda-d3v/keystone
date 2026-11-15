"""Build the Larkspur Mobile phone scenario used by the platform at :3000.

Writes web/platform/scenario/phones.json (workspace data in the API contract
shapes, lineage, catalog) and the source documents under web/public/scenario/.
Every figure is computed here from the parts, orders and rates below, with the
same formulas as api/rules (duty = customs value x rate; awards = annual
volume x unit price x (1 + rate)). Re-run after editing the inputs:

    python scripts/phone_scenario.py
"""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timezone
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "web" / "platform" / "scenario" / "phones.json"
OUT_DOCS = ROOT / "web" / "public" / "scenario"

COMPANY = {"name": "Larkspur Mobile", "legal": "Larkspur Mobile, Inc.", "site": "Fort Worth, Texas"}

# ---------------------------------------------------------------- catalog
SUPPLIERS = {
    "S101": ("Hsinchu Advanced Silicon", "TW", "Hsinchu"),
    "S102": ("Hanul Semiconductor", "KR", "Icheon"),
    "S103": ("Kaohsiung Power Devices", "TW", "Kaohsiung"),
    "S104": ("Penang RF Systems", "MY", "Penang"),
    "S105": ("Bac Ninh Display", "VN", "Bac Ninh"),
    "S106": ("Dong Nai Energy Cells", "VN", "Bien Hoa"),
    "S107": ("Gumi Optics", "KR", "Gumi"),
    "S108": ("Saltillo Precision Metals", "MX", "Saltillo"),
    "S109": ("Snake River Memory", "US", "Boise, Idaho"),
    "S110": ("Lone Star Silicon", "US", "Austin, Texas"),
    "S111": ("Bluegrass Cover Glass", "US", "Harrodsburg, Kentucky"),
    "S112": ("Haiphong Acoustics", "VN", "Hai Phong"),
    "S113": ("Chennai Cell Works", "IN", "Chennai"),
    "S114": ("Kulim Analog Devices", "MY", "Kulim"),
    "S115": ("Monterrey Interconnect", "MX", "Monterrey"),
    "S116": ("Pune Acoustic Systems", "IN", "Pune"),
    "S117": ("Hai Duong Glass", "VN", "Hai Duong"),
    "S118": ("Taoyuan Memory Technology", "TW", "Taoyuan"),
    "S119": ("Noida Optics", "IN", "Noida"),
}
COUNTRIES = {"IN": "India", "TW": "Taiwan", "KR": "South Korea", "MY": "Malaysia", "VN": "Vietnam",
             "MX": "Mexico", "US": "United States"}

PRODUCTS = [  # sku, name, list price, annual units
    ("LM-ONE", "Larkspur One", 599, 420_000),
    ("LM-PRO", "Larkspur One Pro", 899, 260_000),
    ("LM-MAX", "Larkspur One Max", 1099, 120_000),
]
ALL = ["LM-ONE", "LM-PRO", "LM-MAX"]

PARTS = [  # part, description, HTSUS, supplier, unit price, used in
    ("LK-AP-4N", "Application processor, 4 nm", "8542310000", "S101", 52.00, ["LM-ONE"]),
    ("LK-AP-3N", "Application processor, 3 nm", "8542310000", "S101", 68.00, ["LM-PRO", "LM-MAX"]),
    ("LK-DR-08", "LPDDR5X memory, 8 GB", "8542320036", "S102", 19.40, ["LM-ONE"]),
    ("LK-DR-12", "LPDDR5X memory, 12 GB", "8542320036", "S102", 27.80, ["LM-PRO", "LM-MAX"]),
    ("LK-UF-256", "UFS 4.0 storage, 256 GB", "8523510000", "S102", 21.40, ["LM-ONE", "LM-PRO"]),
    ("LK-UF-512", "UFS 4.0 storage, 512 GB", "8523510000", "S102", 36.90, ["LM-MAX"]),
    ("LK-PM-01", "Power management IC", "8542390090", "S103", 3.10, ALL),
    ("LK-RF-5G", "5G RF transceiver", "8542390090", "S104", 8.40, ALL),
    ("LK-DD-61", "OLED display driver IC, 6.1-inch", "8542390090", "S101", 2.20, ["LM-ONE", "LM-PRO"]),
    ("LK-DD-67", "OLED display driver IC, 6.7-inch", "8542390090", "S101", 2.60, ["LM-MAX"]),
    ("LK-OL-61", "OLED display module, 6.1-inch", "8524920000", "S105", 34.00, ["LM-ONE", "LM-PRO"]),
    ("LK-OL-67", "OLED display module, 6.7-inch", "8524920000", "S105", 45.00, ["LM-MAX"]),
    ("LK-BT-40", "Lithium-ion battery, 4,000 mAh", "8507600020", "S106", 7.80, ["LM-ONE"]),
    ("LK-BT-46", "Lithium-ion battery, 4,600 mAh", "8507600020", "S106", 9.20, ["LM-PRO", "LM-MAX"]),
    ("LK-CM-48", "Main camera module, 48 MP", "8525895050", "S107", 16.00, ALL),
    ("LK-CM-12", "Ultra-wide camera module, 12 MP", "8525895050", "S107", 6.50, ["LM-PRO", "LM-MAX"]),
    ("LK-FR-61", "Aluminum frame, 6.1-inch", "7616995190", "S108", 11.00, ["LM-ONE", "LM-PRO"]),
    ("LK-FR-67", "Aluminum frame, 6.7-inch", "7616995190", "S108", 13.50, ["LM-MAX"]),
    ("LK-GL-61", "Cover glass, 6.1-inch", "7007190000", "S111", 4.50, ["LM-ONE", "LM-PRO"]),
    ("LK-GL-67", "Cover glass, 6.7-inch", "7007190000", "S111", 5.40, ["LM-MAX"]),
    ("LK-SP-01", "Speaker module", "8518298000", "S112", 1.20, ALL),
    ("LK-UC-01", "USB-C receptacle", "8536694040", "S112", 0.40, ALL),
    ("LK-HP-01", "Haptic actuator", "8501104060", "S112", 1.90, ALL),
]
HEADINGS = {
    "854231": "Processors and controllers",
    "854232": "Memories",
    "854239": "Other integrated circuits",
    "852351": "Solid-state storage devices",
    "852492": "OLED display modules",
    "850760": "Lithium-ion batteries",
    "852589": "Camera modules",
    "761699": "Aluminum articles",
    "700719": "Toughened safety glass",
    "851829": "Loudspeakers",
    "853669": "Connectors",
    "850110": "Small electric motors",
}
# Port of entry by supplier country. Cover glass is domestic: no entry.
PORTS = {
    "air": ("5501", "Dallas/Fort Worth, Texas"),
    "ocean": ("2704", "Los Angeles, California"),
    "truck": ("2304", "Laredo, Texas"),
}
QUOTES = [  # alternative supplier quotes on file: US fabs, and cheaper parts from abroad
    ("S109", "LK-DR-08", 20.90, "Q-SRM-2611"),
    ("S109", "LK-DR-12", 29.60, "Q-SRM-2611"),
    ("S118", "LK-DR-08", 17.60, "TMT-26-0418"),
    ("S114", "LK-PM-01", 2.65, "KAD-Q-7731"),
    ("S113", "LK-BT-40", 7.10, "CCW-Q-2026-118"),
    ("S113", "LK-BT-46", 8.35, "CCW-Q-2026-118"),
    ("S119", "LK-CM-12", 5.70, "NO-26-332"),
    ("S115", "LK-UC-01", 0.34, "MI-Q-5520"),
    ("S116", "LK-SP-01", 1.02, "PAS-26-091"),
    ("S117", "LK-GL-61", 3.70, "HDG-Q-1187"),
    ("S117", "LK-GL-67", 4.45, "HDG-Q-1187"),
]


def duty_rate(supplier: str, part_hts: str, after_change: bool = True) -> tuple[float, str]:
    """Duty a supplier's part carries at the border, and why."""
    country, hs6 = SUPPLIERS[supplier][1], part_hts[:6]
    if country == "US":
        return 0.0, "Made in the US" if hs6 not in SCOPE else "No duty with US fab proof"
    if country == "MX":
        return 0.0, "USMCA qualifying, no duty"
    if hs6 in SCOPE:
        rate = NEW_RATE if after_change else OLD_RATE
        return rate, f"Section 232 at {rate:.0%}"
    rate = BASE_RATES.get(hs6, 0.0)
    return rate, f"MFN duty {rate * 100:g}%" if rate else "Duty free"

# ---------------------------------------------------------------- the change
CHANGE_ID = "CE-0012"
BULLETIN_ID = "CA-2026-311"
SCOPE = ["854231", "854232", "854239", "852351"]
OLD_RATE, NEW_RATE = 0.10, 0.25
EFFECTIVE = "2027-01-01"
BASE_RATES = {"852492": 0.0, "850760": 0.034, "852589": 0.0, "761699": 0.0,  # MFN, for the part view
              "700719": 0.05, "851829": 0.049, "853669": 0.0, "850110": 0.04}

DECISION_ID = "D-2026-044"
AWARD = {"title": "LPDDR5X memory award", "decided_on": "2026-04-14", "incumbent": "S102",
         "parts": ["LK-DR-08", "LK-DR-12"], "part_label": "2 LPDDR5X memory parts"}
ALT_SUPPLIER, EVIDENCE_PART = "S109", "LK-DR-12"


def hts(code: str) -> str:
    return f"{code[:4]}.{code[4:6]}" + (f".{code[6:]}" if len(code) > 6 else "")


def usd(value: float, digits: int = 2) -> str:
    return f"${value:,.{digits}f}"


def r2(value: float) -> float:
    return round(value + 1e-9, 2)


def annual_qty(products: list[str]) -> int:
    units = {sku: n for sku, _, _, n in PRODUCTS}
    return sum(units[p] for p in products)


# ---------------------------------------------------------------- orders
def build_orders() -> list[dict]:
    months = [("2026-12", "12"), ("2027-01", "01"), ("2027-02", "02")]
    by_supplier: dict[str, list[tuple]] = {}
    for part in PARTS:
        by_supplier.setdefault(part[3], []).append(part)
    orders, serial = [], 1100
    for month, mm in months:
        for index, (supplier, parts) in enumerate(sorted(by_supplier.items())):
            country = SUPPLIERS[supplier][1]
            serial += 1
            po = f"PO-26-{serial}"
            day = 6 + (index * 3) % 15
            mode = "air" if parts[0][2][:4] in {"8542", "8523"} else "truck" if country == "MX" else "ocean"
            for line_no, (part_no, _, _, _, price, products) in enumerate(parts, 1):
                qty = int(round(annual_qty(products) / 12 / 100.0)) * 100
                value = r2(qty * price)
                orders.append({
                    "po_id": po, "line_no": line_no, "part_no": part_no, "supplier_id": supplier,
                    "qty": qty, "unit_price_usd": price, "customs_value_usd": value,
                    "est_entry_date": f"{month}-{day:02d}",
                    "port": None if country == "US" else PORTS[mode][1],
                    "port_code": None if country == "US" else PORTS[mode][0],
                })
    return orders


# ---------------------------------------------------------------- documents
INK, SOFT, RULE = (0.11, 0.13, 0.16), (0.38, 0.41, 0.45), (0.82, 0.83, 0.85)
W, H = 612, 792


class Doc:
    """A one-page document that remembers where each cited line was drawn."""

    def __init__(self, doc_id: str, paper=(1, 1, 1)):
        self.doc_id, self.pdf = doc_id, pymupdf.open()
        self.page = self.pdf.new_page(width=W, height=H)
        if paper != (1, 1, 1):
            self.page.draw_rect(pymupdf.Rect(0, 0, W, H), color=None, fill=paper)
        self.cites: dict[str, list[dict]] = {}

    def text(self, x, y, value, size=10.5, bold=False, color=INK, key=None, quote=None):
        font = "hebo" if bold else "helv"
        self.page.insert_text((x, y), value, fontsize=size, fontname=font, color=color)
        width = pymupdf.get_text_length(value, fontname=font, fontsize=size)
        box = [round(x / W, 4), round((y - size * 0.95) / H, 4), round((x + width) / W, 4), round((y + size * 0.3) / H, 4)]
        if key:
            self.cites.setdefault(key, []).append({"doc_id": self.doc_id, "page": 1, "bbox": box, "quote": quote or value})
        return box

    def para(self, x, y, width, value, size=10, color=SOFT, leading=1.45):
        words, line, lines = value.split(), "", []
        for word in words:
            trial = f"{line} {word}".strip()
            if pymupdf.get_text_length(trial, fontname="helv", fontsize=size) > width:
                lines.append(line); line = word
            else:
                line = trial
        lines.append(line)
        for i, text in enumerate(lines):
            self.page.insert_text((x, y + i * size * leading), text, fontsize=size, fontname="helv", color=color)
        return y + len(lines) * size * leading

    def rule(self, y, x0=48, x1=W - 48):
        self.page.draw_line((x0, y), (x1, y), color=RULE, width=0.6)

    def field(self, y, label, value, key=None, label_w=150):
        self.text(48, y, label, size=9.5, color=SOFT)
        self.text(48 + label_w, y, value, size=10.5, key=key)
        self.rule(y + 9)

    def save_pdf(self, name: str) -> tuple[str, str]:
        path = OUT_DOCS / name
        self.pdf.save(path, garbage=4, deflate=True)
        png = OUT_DOCS / f"{self.doc_id}-page-1.png"
        self.page.get_pixmap(dpi=144).save(png)
        return f"/scenario/{name}", f"/scenario/{png.name}"

    def save_scan(self, name: str) -> tuple[str, str]:
        pix = self.page.get_pixmap(dpi=110, colorspace=pymupdf.csGRAY)
        path = OUT_DOCS / name
        path.write_bytes(pix.tobytes("jpeg", jpg_quality=55))
        return f"/scenario/{name}", f"/scenario/{name}"


def advisory() -> tuple[Doc, dict]:
    d = Doc(BULLETIN_ID)
    d.page.draw_rect(pymupdf.Rect(0, 0, W, 6), color=None, fill=(0.11, 0.19, 0.22))
    d.text(48, 58, "Brazos Customs Brokerage", size=15, bold=True)
    d.text(48, 74, "Licensed customs broker  |  1200 Smith Street, Suite 1800, Houston, TX 77002", size=8.5, color=SOFT)
    d.text(W - 48 - pymupdf.get_text_length("Client advisory " + BULLETIN_ID, fontname="hebo", fontsize=9.5), 58,
           "Client advisory " + BULLETIN_ID, size=9.5, bold=True)
    d.text(W - 48 - pymupdf.get_text_length("November 9, 2026", fontname="helv", fontsize=9), 74, "November 9, 2026", size=9, color=SOFT)
    d.rule(92)
    d.text(48, 114, f"To: {COMPANY['legal']}, Trade Compliance", size=9.5, color=SOFT)
    d.text(48, 146, "Section 232 semiconductors: duty rises to 25%", size=17, bold=True,
           key="measure", quote="Section 232 semiconductors: duty rises to 25%")
    d.text(48, 166, "on January 1, 2027", size=17, bold=True)
    y = d.para(48, 192, W - 96,
               "Commerce has published an amendment to the Section 232 action on semiconductors. The additional duty on "
               "covered integrated circuits and solid-state storage rises from 10% to 25% of the full customs value. "
               "Importers should review open purchase orders that will enter on or after the effective date and confirm "
               "the country of origin of every covered part. For integrated circuits, origin is where the wafer was "
               "fabricated (diffusion), not where the part was packaged or tested.")
    y += 14
    d.text(48, y, "What changes", size=11, bold=True); y += 22
    d.field(y, "Measure", "Section 232 duty, semiconductors and derivative products"); y += 26
    d.field(y, "HTSUS headings", "8542.31, 8542.32, 8542.39, 8523.51", key="hts_scope"); y += 26
    d.field(y, "Previous rate", "10% of the full customs value", key="old_rate"); y += 26
    d.field(y, "New rate", "25% of the full customs value", key="new_rate"); y += 26
    d.field(y, "Effective", "Goods entered on or after 12:01 a.m. EST, January 1, 2027", key="effective_date"); y += 26
    d.field(y, "Assessed on", "Full customs (entered) value, no content deductions", key="basis"); y += 26
    d.field(y, "Countries", "All origins. US-fabricated wafers are not subject.", key="countries"); y += 40
    d.text(48, y, "What we recommend", size=11, bold=True); y += 20
    for line in [
        "1.  Re-price open orders for the headings above with an entry date on or after January 1, 2027.",
        "2.  Confirm the wafer fabrication site for every covered part, and hold supplier certificates on file.",
        "3.  For parts sourced from US fabs, keep a signed origin declaration that names the fab.",
    ]:
        d.text(56, y, line, size=9.5, color=SOFT); y += 18
    d.text(48, H - 40, "Fictional advisory prepared for a product demonstration. Not legal advice.", size=7.5, color=SOFT)
    measure = d.cites["measure"]
    return d, {"measure": measure, **{k: v for k, v in d.cites.items() if k != "measure"}}


def hanul_certificate() -> Doc:
    d = Doc("HSC-CoC-26-10482")
    d.text(48, 58, "Hanul Semiconductor Co., Ltd.", size=14, bold=True)
    d.text(48, 74, "2091 Gyeongchung-daero, Icheon, Gyeonggi-do, Republic of Korea", size=8.5, color=SOFT)
    d.rule(90)
    d.text(48, 122, "Certificate of Conformance", size=17, bold=True)
    d.text(48, 140, "No. HSC-CoC-26-10482   |   Issued October 27, 2026", size=9, color=SOFT)
    y = 176
    for label, value in [
        ("Customer", f"{COMPANY['legal']}, Fort Worth, TX, USA"), ("Customer PO", "PO-26-1102, line 2"),
        ("Part number", "LK-DR-12 (Hanul H58G66AK6Q)"), ("Description", "LPDDR5X SDRAM, 12 GB, 8533 Mbps"),
        ("Lot / date code", "HN2610-117 / 2643"), ("Quantity", "31,700"),
        ("Wafer fab", "Icheon M16, Republic of Korea"), ("Assembly and test", "Cheongju, Republic of Korea"),
        ("Country of origin", "Republic of Korea"), ("HTSUS", "8542.32.0036"),
    ]:
        key = {"Part number": "part_no", "Lot / date code": "lots", "Wafer fab": "wafer_fab",
               "Assembly and test": "assembly_site", "Country of origin": "country_of_origin"}.get(label)
        d.field(y, label, value, key=key); y += 26
    d.para(48, y + 18, W - 96, "We certify that the goods listed above conform to the purchase order and to the "
           "applicable data sheet, and that the country of origin stated is the country where the wafers were fabricated.")
    d.text(48, y + 92, "Ji-woo Park, Quality Assurance Manager", size=10)
    d.text(48, H - 40, "Fictional document prepared for a product demonstration.", size=7.5, color=SOFT)
    return d


def snake_river_scan() -> Doc:
    d = Doc("SRM-CoC-11873", paper=(0.95, 0.94, 0.91))
    d.text(52, 62, "SNAKE RIVER MEMORY, INC.", size=14, bold=True, key="supplier_name", quote="Snake River Memory, Inc.")
    d.text(52, 78, "Boise, Idaho 83716, USA", size=8.5, color=SOFT)
    d.rule(92, 52, W - 44)
    d.text(52, 122, "Certificate of Conformance and Origin Statement", size=15, bold=True)
    d.text(52, 140, "No. SRM-CoC-11873   |   Issued November 5, 2026", size=9, color=SOFT, key="certificate_no", quote="SRM-CoC-11873")
    y = 176
    rows = [
        ("Customer", f"{COMPANY['legal']}, Fort Worth, TX", None),
        ("Reference", "Quotation Q-SRM-2611 (qualification lots)", None),
        ("Part number", "LK-DR-12 (SRM SR5X12G-85)", "part_no"),
        ("Description", "LPDDR5X SDRAM, 12 GB, 8533 Mbps", None),
        ("Lots", "SRM-2611-A, SRM-2611-B", "lots"),
        ("Date code", "2645", None),
        ("Wafer fab (diffusion)", "Boise, Idaho, USA", "wafer_fab"),
        ("Assembly and test", "Boise, Idaho, USA", "assembly_site"),
        ("Country of origin", "United States", "country_of_origin"),
    ]
    for label, value, key in rows:
        d.text(52, y, label, size=9.5, color=SOFT)
        d.text(212, y, value, size=10.5, key=key)
        d.rule(y + 9, 52, W - 44)
        if key == "wafer_fab":  # smudged on the scan
            d.page.draw_rect(pymupdf.Rect(196, y - 14, 420, y + 6), color=None, fill=(0.42, 0.41, 0.39), fill_opacity=0.88)
            d.page.draw_rect(pymupdf.Rect(205, y - 9, 380, y + 2), color=None, fill=(0.3, 0.29, 0.28), fill_opacity=0.6)
        y += 26
    d.para(52, y + 18, W - 100, "Snake River Memory certifies that the goods conform to the purchase specification. "
           "A separate signed origin declaration is issued on request.")
    d.text(52, y + 70, "M. Alvarez, Supplier Quality", size=10)
    d.text(52, H - 40, "Fictional document prepared for a product demonstration.", size=7.5, color=SOFT)
    return d


def snake_river_quote() -> Doc:
    d = Doc("Q-SRM-2611")
    d.text(48, 58, "Snake River Memory, Inc.", size=14, bold=True)
    d.text(48, 74, "Boise, Idaho 83716, USA", size=8.5, color=SOFT)
    d.rule(90)
    d.text(48, 122, "Quotation Q-SRM-2611", size=17, bold=True)
    d.text(48, 140, f"For {COMPANY['legal']}   |   November 6, 2026   |   Valid until January 31, 2027", size=9, color=SOFT)
    y = 178
    d.text(48, y, "Part", size=9, color=SOFT); d.text(200, y, "Description", size=9, color=SOFT)
    d.text(400, y, "Annual qty", size=9, color=SOFT); d.text(490, y, "Unit price", size=9, color=SOFT)
    d.rule(y + 8); y += 26
    for supplier, part, price, _ in [q for q in QUOTES if q[0] == "S109"]:
        info = next(p for p in PARTS if p[0] == part)
        d.text(48, y, part, size=10); d.text(200, y, info[1], size=10)
        d.text(400, y, f"{annual_qty(info[5]):,}", size=10); d.text(490, y, usd(price), size=10)
        d.rule(y + 8); y += 24
    y += 14
    for line in ["Incoterms: FCA Boise, Idaho", "Lead time: 10 weeks after qualification",
                 "Wafer fabrication, assembly and test: Boise, Idaho", "Payment: net 45"]:
        d.text(48, y, line, size=10, color=SOFT); y += 18
    d.text(48, H - 40, "Fictional document prepared for a product demonstration.", size=7.5, color=SOFT)
    return d


# ---------------------------------------------------------------- audit
def audit_chain(rows: list[tuple[str, str, str, str]]) -> list[dict]:
    events, previous = [], None
    for index, (when, actor, kind, entity) in enumerate(rows, 1):
        occurred = datetime.fromisoformat(when.replace("Z", "+00:00")).astimezone(timezone.utc)
        payload = {"actor": actor, "entity_id": entity, "id": f"AUD-{index:04}",
                   "occurred_at": occurred.isoformat(), "previous_hash": previous, "type": kind}
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        events.append({**payload, "occurred_at": when, "hash": digest})
        previous = digest
    return events


def build_awards(parts: dict, decision: dict) -> list[dict]:
    """Supplier awards: annual volume x price x (1 + duty), as the decision rule."""
    def cost(part_nos, supplier, price_of, change=True):
        total = 0
        for part_no in part_nos:
            part = parts[part_no]
            rate, _ = duty_rate(supplier, part["hts10"], after_change=change)
            total += round(part["annual_qty"] * price_of(part_no) * (1 + rate))
        return total
    own = lambda part_no: parts[part_no]["unit_price_usd"]
    quoted = lambda supplier: (lambda part_no: next(q[2] for q in QUOTES if q[0] == supplier and q[1] == part_no))

    def award(id, title, part_nos, label, incumbent, awarded_on, alternative=None, **extra):
        before, now = cost(part_nos, incumbent, own, False), cost(part_nos, incumbent, own)
        switch = cost(part_nos, alternative, quoted(alternative)) if alternative else None
        return {"id": id, "title": title, "parts": part_nos, "part_label": label, "incumbent": incumbent,
                "awarded_on": awarded_on, "alternative": alternative, "before_annual_usd": before,
                "now_annual_usd": now, "switch_annual_usd": switch, **extra}

    return [
        {"id": DECISION_ID, "title": AWARD["title"], "parts": AWARD["parts"], "part_label": AWARD["part_label"],
         "incumbent": AWARD["incumbent"], "awarded_on": AWARD["decided_on"], "alternative": ALT_SUPPLIER,
         "before_annual_usd": decision["incumbent_before_annual_usd"], "now_annual_usd": decision["incumbent_annual_usd"],
         "switch_annual_usd": decision["alternative_with_proof_annual_usd"], "status": "open", "driver": "tariff",
         "recommendation": "Switch to Snake River Memory once the US fab proof is on file.",
         "checks": [{"label": "US fab proof from Snake River Memory", "status": "needs_review"},
                    {"label": "Qualification lots SRM-2611-A and B", "status": "checked"}]},
        award("D-2026-047", "Power management IC award", ["LK-PM-01"], "the power management IC", "S103", "2026-03-02",
              "S114", status="open", driver="tariff",
              recommendation="Move LK-PM-01 to Kulim Analog Devices. Both parts pay 25%, and Kulim's price is lower.",
              checks=[{"label": "Kulim qualification report KAD-QR-0912", "status": "checked"},
                      {"label": "Kulim origin and fab statement", "status": "missing"}]),
        award("D-2026-051", "Battery pack award", ["LK-BT-40", "LK-BT-46"], "2 battery packs", "S106", "2026-02-11",
              "S113", status="review", driver="cost",
              recommendation="Decide after Chennai's qualification samples are tested.",
              next_step="Qualification samples and UN 38.3 report due Jan 22, 2027. Brief to the approver in February 2027.",
              checks=[{"label": "Qualification samples", "status": "missing"},
                      {"label": "UN 38.3 test summary", "status": "missing"}]),
        award("D-2026-038", "Application processor award", ["LK-AP-4N", "LK-AP-3N"], "2 application processors", "S101",
              "2026-01-20", None, status="decided", driver="tariff",
              recommendation="Keep Hsinchu Advanced Silicon. No qualified alternative before 2028.",
              outcome={"decision": "Kept with Hsinchu Advanced Silicon", "by": "Elena Park", "on": "2026-11-12",
                       "note": "The added duty is priced into the 2027 phone cost. Review again in the third quarter of 2027."},
              checks=[{"label": "Alternative supplier qualified", "status": "missing"}]),
        award("D-2026-029", "Cover glass award", ["LK-GL-61", "LK-GL-67"], "2 cover glass parts", "S111", "2025-09-15",
              "S117", status="decided", driver="cost",
              recommendation="Keep Bluegrass Cover Glass.",
              outcome={"decision": "Kept with Bluegrass Cover Glass", "by": "Elena Park", "on": "2026-09-30",
                       "note": "Hai Duong Glass is cheaper but failed the drop-test qualification in August 2026."},
              checks=[{"label": "Hai Duong drop-test qualification", "status": "mismatch"}]),
    ]


def quote_rows(parts: dict) -> list[dict]:
    rows = []
    for supplier, part_no, price, reference in QUOTES:
        part = parts[part_no]
        rate, basis = duty_rate(supplier, part["hts10"])
        current_rate, _ = duty_rate(part["supplier_id"], part["hts10"])
        landed, current = price * (1 + rate), part["unit_price_usd"] * (1 + current_rate)
        rows.append({"supplier_id": supplier, "part_no": part_no, "unit_price_usd": price, "reference": reference,
                     "duty_rate": rate, "duty_basis": basis, "landed_unit_usd": round(landed, 4),
                     "current_landed_unit_usd": round(current, 4),
                     "annual_saving_usd": round((current - landed) * part["annual_qty"])})
    return rows


# ---------------------------------------------------------------- build
def main() -> None:
    OUT_DOCS.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    parts = {p[0]: {"part_no": p[0], "description": p[1], "hts10": p[2], "supplier_id": p[3],
                    "unit_price_usd": p[4], "products": p[5], "annual_qty": annual_qty(p[5])} for p in PARTS}
    orders = build_orders()

    # Exposure: covered headings, entering on or after the effective date.
    lines = []
    for o in orders:
        hs6 = parts[o["part_no"]]["hts10"][:6]
        if hs6 not in SCOPE or o["est_entry_date"] < EFFECTIVE or o["port"] is None:
            continue
        old, new = r2(o["customs_value_usd"] * OLD_RATE), r2(o["customs_value_usd"] * NEW_RATE)
        added = r2(new - old)
        lines.append({
            "po_id": o["po_id"], "line_no": o["line_no"], "part_no": o["part_no"], "supplier_id": o["supplier_id"],
            "est_entry_date": o["est_entry_date"], "customs_value_usd": o["customs_value_usd"],
            "added_duty_usd": added, "old_duty_usd": old, "new_duty_usd": new,
            "math": f"{usd(o['customs_value_usd'])} × ({NEW_RATE * 100:.2f}% − {OLD_RATE * 100:.2f}%) = {usd(added)}",
        })
    covered = [p for p in parts.values() if p["hts10"][:6] in SCOPE]
    annualized = round(sum(p["annual_qty"] * p["unit_price_usd"] for p in covered) * (NEW_RATE - OLD_RATE))
    exposure = {"change_id": CHANGE_ID, "affected_parts": len({l["part_no"] for l in lines}),
                "open_po_lines": len(lines), "added_duty_usd": round(sum(l["added_duty_usd"] for l in lines), 2),
                "annualized_added_duty_usd": annualized, "lines": lines}

    # Documents and citations.
    adv, adv_cites = advisory()
    sources, documents = {}, []
    original, page = adv.save_pdf(f"{BULLETIN_ID}_client_advisory.pdf")
    sources[BULLETIN_ID] = {"title": f"Client advisory {BULLETIN_ID}", "kind": "Bulletin", "original": original, "pages": [page]}
    hanul = hanul_certificate(); o2, p2 = hanul.save_pdf("HSC-CoC-26-10482_LK-DR-12.pdf")
    sources[hanul.doc_id] = {"title": "Hanul certificate of conformance", "kind": "Supplier document", "original": o2, "pages": [p2]}
    quote = snake_river_quote(); o3, p3 = quote.save_pdf("Q-SRM-2611_quotation.pdf")
    sources[quote.doc_id] = {"title": "Snake River Memory quotation", "kind": "Supplier document", "original": o3, "pages": [p3]}
    scan = snake_river_scan(); o4, p4 = scan.save_scan("SRM-CoC-11873_LK-DR-12_scan.jpg")
    sources[scan.doc_id] = {"title": "Snake River Memory certificate (scan)", "kind": "Supplier document", "original": o4, "pages": [p4]}

    change = {
        "id": CHANGE_ID, "measure": "Section 232 semiconductors, rate increase", "hts_scope": SCOPE, "countries": [],
        "old_rate": OLD_RATE, "new_rate": NEW_RATE, "basis": "full_customs_value", "effective_date": EFFECTIVE,
        "citations": adv_cites["measure"], "field_citations": adv_cites,
    }

    # The award: annual volume x price x (1 + rate), as api/rules/decisions.py.
    def award_cost(supplier: str, rate: float) -> float:
        total = 0.0
        for part in AWARD["parts"]:
            price = parts[part]["unit_price_usd"] if supplier == AWARD["incumbent"] else \
                next(q[2] for q in QUOTES if q[0] == supplier and q[1] == part)
            total += round(parts[part]["annual_qty"] * price * (1 + rate))
        return total
    incumbent_before = award_cost(AWARD["incumbent"], OLD_RATE)
    incumbent_now = award_cost(AWARD["incumbent"], NEW_RATE)
    alt_proof, alt_no_proof = award_cost(ALT_SUPPLIER, 0.0), award_cost(ALT_SUPPLIER, NEW_RATE)
    decision = {
        "decision_id": DECISION_ID, "change_id": CHANGE_ID, "status": "broken",
        "reason": f"854232/KR changed from {OLD_RATE:.0%} to {NEW_RATE:.0%}",
        "incumbent_annual_usd": incumbent_now, "alternative_with_proof_annual_usd": alt_proof,
        "alternative_without_proof_annual_usd": alt_no_proof, "incumbent_before_annual_usd": incumbent_before,
        "incumbent_delta_annual_usd": incumbent_now - incumbent_before,
        "alternative_with_proof_delta_usd": alt_proof - incumbent_now,
        "alternative_without_proof_delta_usd": alt_no_proof - incumbent_now,
    }
    saving = incumbent_now - alt_proof

    # Evidence for the switch: the Snake River scan, two lots.
    c = scan.cites
    items = []
    for i, lot in enumerate(["SRM-2611-A", "SRM-2611-B"]):
        lot_cite = {**c["lots"][0], "quote": lot}
        items.append({
            "supplier_id": ALT_SUPPLIER, "part_no": EVIDENCE_PART, "batch_id": lot, "doc_id": scan.doc_id,
            "kind": "certificate_of_conformance", "confidence": 0.86,
            "fields": {"supplier_name": "Snake River Memory, Inc.", "supplier_name_confidence": 0.94,
                       "certificate_no": "SRM-CoC-11873", "certificate_no_confidence": 0.9,
                       "part_no_confidence": 0.93, "batch_id_confidence": 0.91, "date_code": "2645",
                       "wafer_fab": None, "wafer_fab_confidence": 0.38,
                       "assembly_site": "Boise, Idaho, USA", "assembly_site_confidence": 0.9,
                       "country_of_origin": "United States", "country_of_origin_confidence": 0.92},
            "bbox_refs": [c["supplier_name"][0], c["part_no"][0], lot_cite, c["country_of_origin"][0]],
            "field_citations": {"supplier_name": c["supplier_name"], "certificate_no": c["certificate_no"],
                                "part_no": c["part_no"], "batch_id": [lot_cite], "wafer_fab": c["wafer_fab"],
                                "assembly_site": c["assembly_site"], "country_of_origin": c["country_of_origin"]},
        })
    requirements = [
        {"id": "part-number", "label": "Part number", "status": "checked", "citations": c["part_no"]},
        {"id": "lots", "label": "Lots and date code", "status": "checked", "citations": c["lots"]},
        {"id": "wafer-fab", "label": "Wafer fabricated in the US", "status": "needs_review",
         "reason": "The wafer fab line is unreadable on the scan (38% confidence, 85% needed).", "citations": c["wafer_fab"]},
        {"id": "assembly-site", "label": "Assembly and test site", "status": "checked", "citations": c["assembly_site"]},
        {"id": "origin-declaration", "label": "Signed US origin declaration", "status": "missing",
         "reason": "No signed origin declaration is on file for this part.", "citations": []},
    ]
    evidence = {"supplier_id": ALT_SUPPLIER, "part_no": EVIDENCE_PART, "status": "needs_review",
                "missing_requirements": ["Wafer fabricated in the US", "Signed US origin declaration"],
                "items": items, "requirements": requirements}

    pmic = parts["LK-PM-01"]
    pmic_duty = round(pmic["annual_qty"] * pmic["unit_price_usd"] * (NEW_RATE - OLD_RATE))
    actions = [
        {"id": "ACT-0021", "rank": 1, "type": "request_evidence", "part_ids": AWARD["parts"], "usd_at_stake": saving,
         "title": "Ask Snake River Memory for a legible wafer fab statement and a signed US origin declaration",
         "why": f"Moving the LPDDR5X award to Snake River Memory saves {usd(saving, 0)} a year, but only once we can show "
                "the wafers were fabricated in the US.",
         "draft_email": (
             "Hello M. Alvarez,\n\nThank you for certificate SRM-CoC-11873 covering lots SRM-2611-A and SRM-2611-B of "
             "LK-DR-12 (SRM SR5X12G-85).\n\nThe wafer fab line is unreadable on the copy we received. Could you send:\n"
             "1. A legible copy of the certificate showing the wafer fabrication site.\n"
             "2. A signed origin declaration naming the wafer fab for LK-DR-08 and LK-DR-12.\n\n"
             "We need both before we can place volume orders under quotation Q-SRM-2611.\n\n"
             f"Thank you,\nMaya Chen\nSourcing, {COMPANY['legal']}")},
        {"id": "ACT-0022", "rank": 2, "type": "request_quote", "part_ids": ["LK-PM-01"], "usd_at_stake": pmic_duty,
         "title": "Ask Lone Star Silicon to quote the power management IC",
         "why": f"LK-PM-01 from Kaohsiung Power Devices now carries {usd(pmic_duty, 0)} a year in added duty. "
                "A part fabricated in the US would carry none.",
         "draft_email": (
             "Hello,\n\nWe are looking for a second source for our power management IC, LK-PM-01, at about "
             f"{pmic['annual_qty']:,} units a year, starting in the second quarter of 2027.\n\nCould you quote unit "
             "price, lead time and the wafer fab location? We can share the data sheet under NDA.\n\n"
             f"Thank you,\nMaya Chen\nSourcing, {COMPANY['legal']}")},
    ]

    documents = [
        {"doc_id": BULLETIN_ID, "filename": f"{BULLETIN_ID}_client_advisory.pdf", "media_type": "application/pdf",
         "kind": "bulletin", "summary": "Brazos Customs Brokerage advisory: Section 232 duty on 4 semiconductor headings "
         "(8542.31, 8542.32, 8542.39, 8523.51) rises from 10% to 25% of the full customs value for goods entered from Jan 1, 2027.",
         "review": [], "received_at": "2026-11-09T14:05:00Z"},
        {"doc_id": "SRM-CoC-11873", "filename": "SRM-CoC-11873_LK-DR-12_scan.jpg", "media_type": "image/jpeg",
         "kind": "supplier_document", "summary": "Snake River Memory certificate for LK-DR-12, lots SRM-2611-A and SRM-2611-B. "
         "Assembly and test in Boise, Idaho. Country of origin: United States.",
         "review": ["The wafer fab line is unreadable (38% confidence, 85% needed). It will not be used until a clear copy arrives."],
         "received_at": "2026-11-10T09:12:00Z"},
        {"doc_id": "Q-SRM-2611", "filename": "Q-SRM-2611_quotation.pdf", "media_type": "application/pdf",
         "kind": "supplier_document", "summary": "Snake River Memory quotation: LK-DR-08 at $20.90 and LK-DR-12 at $29.60, "
         "FCA Boise, valid until Jan 31, 2027.", "review": [], "received_at": "2026-11-06T16:40:00Z"},
        {"doc_id": "HSC-CoC-26-10482", "filename": "HSC-CoC-26-10482_LK-DR-12.pdf", "media_type": "application/pdf",
         "kind": "supplier_document", "summary": "Hanul Semiconductor certificate for LK-DR-12, lot HN2610-117. "
         "Wafer fab Icheon, Korea. Country of origin: Republic of Korea.", "review": [], "received_at": "2026-10-28T03:20:00Z"},
    ]

    audit = audit_chain([
        ("2026-10-28T03:20:00Z", "A1", "document_ingested", "HSC-CoC-26-10482"),
        ("2026-11-06T16:40:00Z", "A1", "document_ingested", "Q-SRM-2611"),
        ("2026-11-09T14:05:00Z", "A1", "document_ingested", BULLETIN_ID),
        ("2026-11-09T14:06:00Z", "A2", "change_extracted", CHANGE_ID),
        ("2026-11-09T15:20:00Z", "priya.raman", "change_reviewed", CHANGE_ID),
        ("2026-11-09T15:21:00Z", "rules", "rates_versioned", CHANGE_ID),
        ("2026-11-09T15:21:30Z", "rules", "exposure_computed", CHANGE_ID),
        ("2026-11-09T15:22:00Z", "rules", "decision_checked", DECISION_ID),
        ("2026-11-10T09:12:00Z", "A3", "evidence_ingested", ALT_SUPPLIER),
        ("2026-11-10T09:12:30Z", "T14", "evidence_refused", ALT_SUPPLIER),
        ("2026-11-10T09:13:00Z", "T14", "evidence_checked", ALT_SUPPLIER),
        ("2026-11-10T09:30:00Z", "A5", "action_drafted", "ACT-0021"),
        ("2026-11-10T09:30:30Z", "A5", "action_drafted", "ACT-0022"),
    ])

    # Lineage, in the /changes/{id}/lineage shape.
    nodes = [{"id": f"bulletin:{BULLETIN_ID}", "kind": "bulletin", "label": f"Client advisory {BULLETIN_ID}"},
             {"id": f"change:{CHANGE_ID}", "kind": "change", "label": change["measure"], "added_duty_usd": exposure["added_duty_usd"]}]
    edges = [{"source": f"bulletin:{BULLETIN_ID}", "target": f"change:{CHANGE_ID}", "kind": "cites"}]
    for hs6 in SCOPE:
        nodes.append({"id": f"rate:{hs6}:all", "kind": "rate", "label": f"{hts(hs6)}, {HEADINGS[hs6]}: 10% to 25%"})
        edges.append({"source": f"change:{CHANGE_ID}", "target": f"rate:{hs6}:all", "kind": "changes"})
    nodes += [{"id": "assumption:A-0441", "kind": "assumption", "label": "8542.32 from South Korea assumed at 10%"},
              {"id": f"decision:{DECISION_ID}", "kind": "decision", "label": f"{AWARD['title']}, {DECISION_ID}"}]
    edges += [{"source": "rate:854232:all", "target": "assumption:A-0441", "kind": "invalidates"},
              {"source": "assumption:A-0441", "target": f"decision:{DECISION_ID}", "kind": "supports"}]
    for part in AWARD["parts"]:
        edges.append({"source": f"decision:{DECISION_ID}", "target": f"part:{part}", "kind": "covers"})
    for p in covered:
        duty = round(sum(l["added_duty_usd"] for l in lines if l["part_no"] == p["part_no"]), 2)
        nodes.append({"id": f"part:{p['part_no']}", "kind": "part", "label": f"{p['part_no']} · {p['description']}", "added_duty_usd": duty})
        edges.append({"source": f"rate:{p['hts10'][:6]}:all", "target": f"part:{p['part_no']}", "kind": "affects"})
        for sku in p["products"]:
            edges.append({"source": f"part:{p['part_no']}", "target": f"product:{sku}", "kind": "used_in"})
    for l in lines:
        nid = f"purchase_order:{l['po_id']}:{l['line_no']}"
        nodes.append({"id": nid, "kind": "purchase_order", "label": f"{l['po_id']} · line {l['line_no']}", "added_duty_usd": l["added_duty_usd"]})
        edges.append({"source": f"part:{l['part_no']}", "target": nid, "kind": "appears_on"})
    for sku, name, _, _ in PRODUCTS:
        nodes.append({"id": f"product:{sku}", "kind": "product", "label": name})
    lineage = {"change_id": CHANGE_ID, "added_duty_usd": exposure["added_duty_usd"],
               "affected_parts": exposure["affected_parts"], "nodes": nodes, "edges": edges}

    awards = build_awards(parts, decision)
    hc = hanul.cites
    passports = [
        {**evidence, "purpose": "Proves the 0% rate for a switch to a US fab.", "doc_title": "Snake River Memory certificate (scan)"},
        {"supplier_id": "S102", "part_no": "LK-DR-12", "status": "verified", "missing_requirements": [], "items": [],
         "purpose": "Confirms the current supplier's origin, so the 25% rate applies.",
         "requirements": [
             {"id": "part-number", "label": "Part number", "status": "checked", "citations": hc["part_no"]},
             {"id": "lots", "label": "Lot and date code", "status": "checked", "citations": hc["lots"]},
             {"id": "wafer-fab-foreign", "label": "Wafer fab named", "status": "checked", "citations": hc["wafer_fab"]},
             {"id": "assembly-site", "label": "Assembly and test site", "status": "checked", "citations": hc["assembly_site"]},
             {"id": "certificate-origin", "label": "Country of origin", "status": "checked", "citations": hc["country_of_origin"]},
         ]},
        {"supplier_id": "S114", "part_no": "LK-PM-01", "status": "missing", "items": [],
         "missing_requirements": ["Part number", "Wafer fab named", "Country of origin"],
         "purpose": "Needed before the first Kulim shipment if the power management IC award is approved.",
         "requirements": [
             {"id": "part-number", "label": "Part number", "status": "missing", "reason": "Requested after the award is approved.", "citations": []},
             {"id": "wafer-fab-foreign", "label": "Wafer fab named", "status": "missing", "reason": "Requested after the award is approved.", "citations": []},
             {"id": "certificate-origin", "label": "Country of origin", "status": "missing", "reason": "Requested after the award is approved.", "citations": []},
         ]},
        {"supplier_id": "S113", "part_no": "LK-BT-46", "status": "missing", "items": [],
         "missing_requirements": ["UN 38.3 test summary", "Country of origin"],
         "purpose": "Needed before the first battery shipment from Chennai, planned for the second quarter of 2027.",
         "requirements": [
             {"id": "part-number", "label": "Part number", "status": "checked", "reason": None, "citations": []},
             {"id": "un383", "label": "UN 38.3 test summary", "status": "missing", "reason": "Due with the qualification samples on Jan 22, 2027.", "citations": []},
             {"id": "certificate-origin", "label": "Country of origin", "status": "missing", "reason": "Due with the qualification samples on Jan 22, 2027.", "citations": []},
         ]},
    ]
    worklist = [
        {"id": "W-01", "status": "open", "title": "Snake River certificate is unreadable", "kind": "Document",
         "detail": "The wafer fab line on SRM-CoC-11873 is below the 85% confidence needed. Sourcing has a request ready for a clear copy.",
         "supplier_id": "S109", "part_no": "LK-DR-12", "due": "2026-11-30", "href": "/compliance/evidence?passport=S109-LK-DR-12"},
        {"id": "W-02", "status": "open", "title": "Confirm the HTS code for UFS storage", "kind": "Classification",
         "detail": "Hanul's invoice shows 8542.32.0071; our parts master has 8523.51.0000. Both are covered at 25%, but the entry must match one code.",
         "supplier_id": "S102", "part_no": "LK-UF-256", "due": "2026-12-15", "href": "/compliance/duty-bill"},
        {"id": "W-03", "status": "open", "title": "Origin conflict on the 5G transceiver", "kind": "Origin",
         "detail": "Penang RF invoice INV-PRF-26-4471 declares Malaysia; their fab statement names Hsinchu, Taiwan. For chips, origin is the fab country.",
         "supplier_id": "S104", "part_no": "LK-RF-5G", "due": "2026-12-20", "href": "/compliance/duty-bill"},
        {"id": "W-04", "status": "open", "title": "Hanul origin declaration expires Dec 31", "kind": "Certificate",
         "detail": "Request the 2027 annual declaration so January entries of memory and storage are covered.",
         "supplier_id": "S102", "part_no": "LK-DR-12", "due": "2026-12-31", "href": "/compliance/evidence?passport=S102-LK-DR-12"},
        {"id": "W-05", "status": "open", "title": "December air shipments must clear before Jan 1", "kind": "Entry timing",
         "detail": "Ten chip order lines are booked to enter at Dallas/Fort Worth between Dec 6 and Dec 21. Any that slip past Dec 31 pay 25% instead of 10%.",
         "due": "2026-12-21", "href": "/compliance/duty-bill"},
        {"id": "L-01", "status": "later", "title": "Kulim Analog Devices origin and fab statement", "kind": "Origin",
         "detail": "Only needed if the power management IC award moves to Kulim. Phase 2, after the approver decides.",
         "supplier_id": "S114", "part_no": "LK-PM-01", "due": "2027-01-15", "href": "/compliance/evidence?passport=S114-LK-PM-01"},
        {"id": "L-02", "status": "later", "title": "Chennai Cell Works battery documents", "kind": "Certificate",
         "detail": "UN 38.3 test summary and certificate of origin, due with the qualification samples.",
         "supplier_id": "S113", "part_no": "LK-BT-46", "due": "2027-01-22", "href": "/compliance/evidence?passport=S113-LK-BT-46"},
        {"id": "L-03", "status": "later", "title": "Post-summary corrections for January entries", "kind": "Filing",
         "detail": "If any January entry was filed at the old 10% rate, correct it with Brazos Customs Brokerage before liquidation.",
         "due": "2027-02-15", "href": "/compliance/duty-bill"},
        {"id": "L-04", "status": "later", "title": "Quarterly Section 232 reconciliation", "kind": "Filing",
         "detail": "Match entry summaries to the duty bill with the broker for the first quarter of 2027.",
         "due": "2027-04-15", "href": "/compliance/duty-bill"},
        {"id": "D-01", "status": "done", "title": "Advisory CA-2026-311 read and confirmed", "kind": "Document",
         "detail": "All seven fields checked against the advisory by Priya Raman.", "due": "2026-11-09", "href": "/compliance/documents"},
        {"id": "D-02", "status": "done", "title": "Hanul certificate checked", "kind": "Certificate",
         "detail": "HSC-CoC-26-10482: wafer fab Icheon, Korea. The 25% rate applies to LK-DR-12.",
         "supplier_id": "S102", "part_no": "LK-DR-12", "due": "2026-10-28", "href": "/compliance/evidence?passport=S102-LK-DR-12"},
        {"id": "D-03", "status": "done", "title": "Snake River quotation filed", "kind": "Document",
         "detail": "Q-SRM-2611 states fab, assembly and test in Boise, Idaho.", "supplier_id": "S109", "due": "2026-11-06", "href": "/compliance/documents"},
        {"id": "D-04", "status": "done", "title": "Cover glass origin confirmed", "kind": "Origin",
         "detail": "Bluegrass Cover Glass makes both sizes in Harrodsburg, Kentucky. No import entry needed.",
         "supplier_id": "S111", "part_no": "LK-GL-61", "due": "2026-09-30", "href": "/compliance/documents"},
    ]

    catalog = {
        "awards": awards,
        "passports": passports,
        "worklist": worklist,
        "company": COMPANY,
        "suppliers": {k: {"name": n, "country": COUNTRIES[c], "country_code": c, "city": city} for k, (n, c, city) in SUPPLIERS.items()},
        "products": [{"sku": s, "name": n, "list_price_usd": p, "annual_units": u} for s, n, p, u in PRODUCTS],
        "parts": list(parts.values()),
        "orders": orders,
        "quotes": quote_rows(parts),
        "headings": HEADINGS,
        "action_suppliers": {"ACT-0021": ALT_SUPPLIER, "ACT-0022": "S110"},
        "base_rates": {**BASE_RATES, **{h: OLD_RATE for h in SCOPE}},
        "award": {**AWARD, "decision_id": DECISION_ID, "assumption": f"a {OLD_RATE:.0%} Section 232 duty on the full customs value",
                  "alternative": ALT_SUPPLIER},
    }
    workspace = {"changes": [change], "exposure": exposure, "decisions": [decision], "evidence": evidence,
                 "actions": actions, "audit": audit, "documents": documents}
    OUT_JSON.write_text(json.dumps({"workspace": workspace, "lineage": lineage, "catalog": catalog, "sources": sources},
                                   indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(lines)} lines, {usd(exposure['added_duty_usd'])} on open orders, {usd(annualized, 0)} a year")
    print(f"award: before {usd(incumbent_before, 0)}, now {usd(incumbent_now, 0)}, "
          f"switch with proof {usd(alt_proof - incumbent_now, 0)}, without {usd(alt_no_proof - incumbent_now, 0)}")


if __name__ == "__main__":
    main()
