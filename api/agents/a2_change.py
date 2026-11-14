"""T22 - A2 Change Extractor: regulatory bulletin -> ChangeEvent with citations.

How it keeps the trust rule (every value links back to its source):

1. PyMuPDF splits the bulletin into numbered text blocks, each with its
   page, normalized bbox ([x0, y0, x1, y1], top-left origin) and text.
2. The large model reads the PDF and that block list, and returns each
   field's value plus the ids of the blocks that state it. It never
   writes coordinates or quotes.
3. Citations are built here from the block ids, so page, bbox and quote
   are exact. Each value is then checked against its quoted text (codes
   and percentages must appear verbatim; the date must be stated). A
   field with no valid citation, or one its quote doesn't support, is
   left null and flagged, and no ChangeEvent is emitted until a person
   resolves it.

Optional ``hts_validator`` checks HS6 codes against the USITC HTS (the
loader has the live lookup); offline it is skipped.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Iterable, Literal

from pydantic import BaseModel, Field

from contracts.models import ChangeEvent, Citation

from .a1_intake import IntakeResult
from .llm import Attachment, LLMClient, get_client, sha256_bytes

log = logging.getLogger(__name__)

TASK = "a2_change"
CITED_FIELDS = ("measure", "hts_scope", "old_rate", "new_rate", "effective_date", "basis")
Basis = Literal["full_customs_value", "metal_content", "other"]


# --------------------------------------------------------------------------
# Source blocks
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Block:
    id: int
    page: int
    bbox: tuple[float, float, float, float]
    text: str

    def citation(self, doc_id: str) -> Citation:
        return Citation(doc_id=doc_id, page=self.page, bbox=self.bbox, quote=self.text)


def pdf_blocks(data: bytes) -> list[Block]:
    """Text blocks of every page with normalized, top-left-origin bboxes."""
    import pymupdf

    blocks: list[Block] = []
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        for page_no, page in enumerate(doc, start=1):
            w, h = page.rect.width, page.rect.height
            for x0, y0, x1, y1, text, *_rest in page.get_text("blocks", sort=True):
                clean = " ".join(text.split())
                if not clean:
                    continue
                bbox = (round(x0 / w, 5), round(y0 / h, 5), round(x1 / w, 5), round(y1 / h, 5))
                blocks.append(Block(len(blocks) + 1, page_no, bbox, clean))
    return blocks


# --------------------------------------------------------------------------
# Model output schema (values + block ids, never coordinates)
# --------------------------------------------------------------------------


class CitedText(BaseModel):
    value: str | None = Field(description="The value as stated, or null if the bulletin does not state it")
    block_ids: list[int] = Field(description="Ids of the blocks that state this value")


class CitedCodes(BaseModel):
    value: list[str] = Field(description="Affected HTS codes exactly as printed, e.g. 8413.91")
    block_ids: list[int]


class CitedRate(BaseModel):
    value: float | None = Field(description="Ad valorem rate as a fraction, e.g. 0.25 for 25%")
    block_ids: list[int]


class CitedDate(BaseModel):
    value: date | None = Field(description="Date the new rate takes effect, YYYY-MM-DD")
    block_ids: list[int]


class CitedBasis(BaseModel):
    value: Basis | None = Field(description="What the rate is assessed on")
    block_ids: list[int]


class CitedCountries(BaseModel):
    value: list[str] = Field(description="ISO2 countries the change applies to; empty if it applies to all origins")
    block_ids: list[int]


class ChangeDraft(BaseModel):
    """Structured output the large model fills in for A2."""

    measure: CitedText = Field(description="Short name of the measure or notice")
    hts_scope: CitedCodes
    countries: CitedCountries
    old_rate: CitedRate = Field(description="Rate before the change")
    new_rate: CitedRate = Field(description="Rate after the change")
    effective_date: CitedDate
    basis: CitedBasis


SYSTEM_PROMPT = (
    "You extract tariff changes from regulatory bulletins for a procurement team. "
    "Report only what the document states. For every field, cite the ids of the "
    "numbered blocks that state it. If the document does not state a value, return "
    "null with no block ids. Do not compute anything."
)


def build_prompt(blocks: Iterable[Block]) -> str:
    listing = "\n".join(f"[{b.id}] (page {b.page}) {b.text}" for b in blocks)
    return (
        "Extract the tariff change in this bulletin. The document's text blocks are "
        "numbered below; cite them by id.\n\n"
        "Rules:\n"
        "- hts_scope: every affected heading, exactly as printed.\n"
        "- old_rate and new_rate: the general rates before and after, as fractions. "
        "Ignore country-specific exceptions here.\n"
        "- countries: only if the change is limited to specific origins; otherwise empty.\n"
        "- basis: full_customs_value if duty is assessed on the article's full customs value.\n\n"
        f"Blocks:\n{listing}"
    )


# --------------------------------------------------------------------------
# Result
# --------------------------------------------------------------------------


@dataclass
class ChangeExtraction:
    """``change`` is set only when every cited field is supported by its source."""

    doc_id: str
    change: ChangeEvent | None
    values: dict[str, object]
    field_citations: dict[str, list[Citation]]
    flags: dict[str, str] = field(default_factory=dict)

    @property
    def needs_review(self) -> bool:
        return self.change is None or bool(self.flags)


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def extract_change(
    bulletin: IntakeResult | bytes,
    *,
    doc_id: str | None = None,
    change_id: str,
    client: LLMClient | None = None,
    hts_validator: Callable[[str], bool] | None = None,
) -> ChangeExtraction:
    """Read a bulletin PDF and return a cited ChangeEvent (or a flagged draft)."""
    if isinstance(bulletin, IntakeResult):
        data = bulletin.content
        doc_id = doc_id or bulletin.envelope.doc_id
        if bulletin.envelope.media_type != "application/pdf":
            raise ValueError(f"A2 reads bulletin PDFs; got {bulletin.envelope.media_type}")
    else:
        data = bulletin
    if not doc_id:
        raise ValueError("doc_id is required")

    blocks = pdf_blocks(data)
    if not blocks:
        raise ValueError(f"{doc_id} has no text layer; run it through OCR/vision first")

    draft = (client or get_client()).extract(
        ChangeDraft,
        task=TASK,
        system=SYSTEM_PROMPT,
        prompt=build_prompt(blocks),
        file_sha256=sha256_bytes(data),
        attachments=[Attachment(data, "application/pdf", f"{doc_id}.pdf")],
        tier="large",
    )
    return assemble(draft, blocks, doc_id=doc_id, change_id=change_id, hts_validator=hts_validator)


def assemble(
    draft: ChangeDraft,
    blocks: list[Block],
    *,
    doc_id: str,
    change_id: str,
    hts_validator: Callable[[str], bool] | None = None,
) -> ChangeExtraction:
    """Deterministic half of A2: resolve citations and check values against them."""
    by_id = {b.id: b for b in blocks}
    values: dict[str, object] = {}
    cites: dict[str, list[Citation]] = {}
    flags: dict[str, str] = {}

    for name in CITED_FIELDS:
        item = getattr(draft, name)
        cited = [by_id[i] for i in dict.fromkeys(item.block_ids) if i in by_id]
        bad_ids = [i for i in item.block_ids if i not in by_id]
        value = item.value
        if value in (None, [], ""):
            flags[name] = "not stated in the bulletin"
            values[name] = None
            continue
        if bad_ids:
            log.warning("A2 %s: unknown block ids %s", name, bad_ids)
        if not cited:
            flags[name] = "no valid citation"
            values[name] = None
            continue
        problem = _check(name, value, " ".join(b.text for b in cited))
        if problem:
            flags[name] = problem
            values[name] = None
            continue
        values[name] = _normalize(name, value)
        cites[name] = [b.citation(doc_id) for b in cited]

    if values.get("hts_scope") and hts_validator is not None:
        unknown = [c for c in values["hts_scope"] if not hts_validator(c)]  # type: ignore[union-attr]
        if unknown:
            flags["hts_scope"] = f"not found in USITC HTS: {', '.join(unknown)}"

    rates = values.get("old_rate"), values.get("new_rate")
    if None not in rates and rates[0] == rates[1]:
        flags["new_rate"] = "new rate equals old rate"

    countries = sorted({c.strip().upper() for c in draft.countries.value if c.strip()})
    if countries:
        country_blocks = [by_id[i] for i in draft.countries.block_ids if i in by_id]
        if not country_blocks:
            flags["countries"] = "countries listed without a citation"
        else:
            cites["countries"] = [b.citation(doc_id) for b in country_blocks]
    values["countries"] = countries

    change = None
    if not flags:
        unique: dict[tuple, Citation] = {}
        for cs in cites.values():
            for c in cs:
                unique.setdefault((c.page, c.bbox), c)
        change = ChangeEvent(
            id=change_id,
            measure=values["measure"],
            hts_scope=values["hts_scope"],
            countries=countries,
            old_rate=values["old_rate"],
            new_rate=values["new_rate"],
            basis=values["basis"],
            effective_date=values["effective_date"],
            citations=sorted(unique.values(), key=lambda c: (c.page, c.bbox[1], c.bbox[0])),
            field_citations=cites,
        )
    return ChangeExtraction(doc_id, change, values, cites, flags)


# --------------------------------------------------------------------------
# Value checks: the cited text must state the value
# --------------------------------------------------------------------------

_MONTHS = ("january february march april may june july august september october november december").split()


def _check(name: str, value: object, quote: str) -> str | None:
    q = " ".join(quote.split())
    low = q.lower()
    if name == "hts_scope":
        missing = [c for c in value if _hts_pattern(c).search(q) is None]  # type: ignore[union-attr]
        bad = [c for c in value if len(_digits(c)) < 4]  # type: ignore[union-attr]
        if bad:
            return f"not an HTS heading: {', '.join(bad)}"
        return f"codes not in cited text: {', '.join(missing)}" if missing else None
    if name in ("old_rate", "new_rate"):
        rate = float(value)  # type: ignore[arg-type]
        if not 0 <= rate <= 1:
            return f"rate {rate} is not a fraction"
        pct = _pct(rate)
        return None if re.search(rf"(?<![\d.]){re.escape(pct)}\s*%", q) else f"{pct}% not in cited text"
    if name == "effective_date":
        d = value if isinstance(value, date) else date.fromisoformat(str(value))
        stated = (
            f"{_MONTHS[d.month - 1]} {d.day}, {d.year}" in low
            or d.isoformat() in q
            or f"{d.month}/{d.day}/{d.year}" in q
        )
        return None if stated else f"{d.isoformat()} not stated in cited text"
    if name == "basis":
        if value == "full_customs_value":
            return None if "full customs value" in low else "cited text does not say full customs value"
        if value == "metal_content":
            return None if "metal content" in low else "cited text does not mention metal content"
        return None
    if name == "measure":
        return None if str(value).strip() else "empty"
    return None


def _normalize(name: str, value: object) -> object:
    if name == "hts_scope":
        return list(dict.fromkeys(_digits(c) for c in value))  # type: ignore[union-attr]
    if name in ("old_rate", "new_rate"):
        return round(float(value), 4)  # type: ignore[arg-type]
    if name == "effective_date":
        return value if isinstance(value, date) else date.fromisoformat(str(value))
    if name == "measure":
        return " ".join(str(value).split())
    return value


def _digits(code: str) -> str:
    return re.sub(r"\D", "", code)


def _hts_pattern(code: str) -> re.Pattern[str]:
    d = _digits(code)
    # 8413.91 / 841391 / 8413.91.00: allow optional dots between digit groups.
    groups = [d[:4], d[4:6], d[6:8], d[8:10]]
    body = r"\.?".join(re.escape(g) for g in groups if g)
    return re.compile(rf"(?<!\d){body}(?!\d)")


def _pct(rate: float) -> str:
    pct = round(rate * 100, 4)
    return str(int(pct)) if pct == int(pct) else f"{pct:g}"
