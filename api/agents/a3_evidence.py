"""T23 - A3 Evidence Extractor: supplier document -> EvidenceItem(s).

Reads a mill/inspection certificate or origin declaration and returns one
``contracts.models.EvidenceItem`` per heat/batch, which is the shape
``api.rules.evidence.check_uk_evidence`` (T14) consumes. Every field
carries a ``field_citations`` entry and a ``<field>_confidence`` value.

Two reading paths, chosen by whether the document has a text layer:

* Text-layer PDF (Ningbo): PyMuPDF numbered blocks plus the large model,
  which names each value and the block ids that state it. A value is kept
  only if it appears verbatim in its cited text; then its confidence is
  ``TEXT_LAYER_CONFIDENCE`` and its citation is the exact block bbox.
* Scan or image-only PDF (Sheffield): the vision model reads the page
  three times, independently (two enhanced renderings and the original
  pixels). Per field it reports read / unclear / not_present, the value, a
  confidence and a normalized bbox. A value is confirmed only when the reads
  agree by majority
  on it (see ``agree``); a covered or disputed field stays below
  ``MIN_CONFIDENCE`` and is stored as null with its confidence, so T14
  marks it Needs review instead of Checked. Its bbox is kept so the UI
  can show the region.

The extractor only reads documents. Evidence status is decided by
``api/rules/evidence.py``, never here.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Callable, Literal, Union

from pydantic import BaseModel, Field

from contracts.models import Citation, EvidenceItem

from .a1_intake import IntakeResult
from .a2_change import Block, pdf_blocks
from .llm import Attachment, LLMClient, get_client, sha256_bytes

log = logging.getLogger(__name__)

TASK_TEXT = "a3_evidence_text"
TASK_VISION = "a3_evidence_vision"
TASK_VISION_CHECK = "a3_evidence_vision_check"
TASK_VISION_ALT = "a3_evidence_vision_alt"
AGREED_CONFIDENCE = 0.9  # every read gave the same value
MAJORITY_CONFIDENCE = 0.86  # two of three reads agree, one read differs
AGREE_FLOOR = 0.5  # below this either read thinks it is probably wrong; agreement can't rescue it
MIN_CONFIDENCE = 0.85  # same threshold as api/rules/evidence.py
TEXT_LAYER_CONFIDENCE = 0.98
MIN_TEXT_CHARS = 200  # below this a PDF is treated as a scan

DocKind = Literal["mill_certificate", "origin_declaration", "other"]

# Scalar fields read from a certificate, in display order.
FIELDS: tuple[str, ...] = (
    "supplier_name",
    "certificate_no",
    "issue_date",
    "expires_on",
    "customer_po",
    "part_no",
    "material_spec",
    "hs_code",
    "country_of_origin",
    "melt_location",
)


# --------------------------------------------------------------------------
# Model output schemas
# --------------------------------------------------------------------------


class TextField(BaseModel):
    value: str | None = Field(description="Value exactly as printed, or null if absent")
    block_ids: list[int] = Field(description="Ids of the blocks that print this value")


class TextHeat(BaseModel):
    heat_no: str = Field(description="Heat or batch number exactly as printed")
    qty: str | None = Field(default=None, description="Quantity for this heat as printed")
    block_ids: list[int]


class TextEvidenceDraft(BaseModel):
    """Large-model output for a text-layer document."""

    doc_kind: DocKind
    supplier_name: TextField
    certificate_no: TextField
    issue_date: TextField
    expires_on: TextField
    customer_po: TextField
    part_no: TextField
    material_spec: TextField
    hs_code: TextField
    country_of_origin: TextField
    melt_location: TextField = Field(description="Where the metal was melted and poured")
    heats: list[TextHeat]


class SeenField(BaseModel):
    status: Literal["read", "unclear", "not_present"] = Field(
        default="read",
        description="read = you can make out the value; unclear = it is on the page but covered, "
        "smudged, cut off or too blurred to read; not_present = the document has no such field",
    )
    value: str | None = Field(description="Value as you read it; null if unclear or not present")
    confidence: float = Field(ge=0, le=1, description="Probability that every character of value is right (see scale)")
    bbox: list[float] = Field(description="[x0, y0, x1, y1] of the value on the page, 0-1, top-left origin; [] if not present")
    page: int = Field(default=1, ge=1)


class SeenHeat(BaseModel):
    heat_no: SeenField
    qty: SeenField | None = None


class VisionEvidenceDraft(BaseModel):
    """Vision-model output for a scan."""

    doc_kind: DocKind
    supplier_name: SeenField
    certificate_no: SeenField
    issue_date: SeenField
    expires_on: SeenField
    customer_po: SeenField
    part_no: SeenField
    material_spec: SeenField
    hs_code: SeenField
    country_of_origin: SeenField
    melt_location: SeenField = Field(description="Where the metal was melted and poured")
    heats: list[SeenHeat]


SYSTEM_PROMPT = (
    "You read supplier compliance documents (mill and inspection certificates, origin "
    "declarations) for a procurement team. Report only what is printed. Never infer a "
    "value from context: if the melt location is smudged, covered or cut off, say you "
    "cannot read it, even if the country of origin or the supplier's address suggests one."
)


def text_prompt(blocks: list[Block]) -> str:
    listing = "\n".join(f"[{b.id}] (page {b.page}) {b.text}" for b in blocks)
    return (
        "Extract the certificate fields. The document's text blocks are numbered below; "
        "for each field give the value exactly as printed and the ids of the blocks that "
        "print it. List every heat/batch row. Use null and no ids for anything not printed.\n\n"
        f"Blocks:\n{listing}"
    )


VISION_PROMPT = (
    "This is a scanned supplier certificate. For each field give its status, the value, "
    "your confidence and the bbox of the value as fractions of page width and height, "
    "top-left origin. List every heat/batch row.\n\n"
    "Confidence is the probability that every character of the value is right. Judge each "
    "field on its own, not the scan as a whole:\n"
    "- 0.95: every character is clear.\n"
    "- 0.90: blurred or noisy, but each character is still distinguishable and you would "
    "stake the order on it.\n"
    "- 0.60-0.80: one or more characters could be something else.\n"
    "- below 0.30: covered, smudged or cut off; use status unclear, value null, and give the "
    "bbox of where the value should be.\n"
    "If the document has no such field (for example no expiry date), use status not_present, "
    "value null and bbox []."
)


# --------------------------------------------------------------------------
# Result
# --------------------------------------------------------------------------


@dataclass
class EvidenceExtraction:
    doc_id: str
    doc_kind: str
    method: Literal["text", "vision"]
    items: list[EvidenceItem]
    field_confidence: dict[str, float]
    flags: dict[str, str] = field(default_factory=dict)

    @property
    def low_confidence_fields(self) -> list[str]:
        return [k for k, v in self.field_confidence.items() if v < MIN_CONFIDENCE]


SupplierResolver = Callable[[str], Union[str, None]]


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def extract_evidence(
    doc: IntakeResult,
    *,
    resolve_supplier: SupplierResolver,
    client: LLMClient | None = None,
) -> EvidenceExtraction:
    """Read one supplier document routed by A1.

    ``resolve_supplier`` maps the printed supplier name to a supplier_id
    (A4 entity matching in the pipeline). An unresolved name is flagged
    and the item's supplier_id is left empty so no rule can match it.
    """
    data, media_type, doc_id = doc.content, doc.envelope.media_type, doc.envelope.doc_id
    client = client or get_client()
    sha = sha256_bytes(data)

    blocks = pdf_blocks(data) if media_type == "application/pdf" else []
    if sum(len(b.text) for b in blocks) >= MIN_TEXT_CHARS:
        draft = client.extract(
            TextEvidenceDraft,
            task=TASK_TEXT,
            system=SYSTEM_PROMPT,
            prompt=text_prompt(blocks),
            file_sha256=sha,
            attachments=[Attachment(data, media_type, doc.envelope.filename)],
            tier="large",
        )
        return _from_text(draft, blocks, doc_id, resolve_supplier)

    if not (media_type == "application/pdf" or media_type.startswith("image/")):
        raise ValueError(f"A3 cannot read {media_type}")
    # Three independent reads: two enhanced renderings and the original pixels.
    reads = [
        client.extract(
            VisionEvidenceDraft,
            task=task,
            system=SYSTEM_PROMPT,
            prompt=VISION_PROMPT,
            file_sha256=sha,
            attachments=[attachment],
            tier="large",
        )
        for task, attachment in (
            (TASK_VISION, prepare_scan(data, media_type, doc.envelope.filename)),
            (TASK_VISION_ALT, prepare_scan(data, media_type, doc.envelope.filename, width=2000, gamma=1.3)),
            (TASK_VISION_CHECK, Attachment(data, media_type, doc.envelope.filename)),
        )
    ]
    return _from_vision(agree(*reads), doc_id, resolve_supplier)



# --------------------------------------------------------------------------
# Agreement between two independent reads
# --------------------------------------------------------------------------


def agree(*reads: VisionEvidenceDraft) -> VisionEvidenceDraft:
    """Confidence from reproducibility, not from one self-rating.

    Live testing showed the vision model reads blurred-but-legible fields
    correctly yet rates them 0.55-0.80, occasionally misreads one digit on
    the low-resolution original, and reliably reports covered fields as
    ``unclear``. So each field is voted on across independent reads:

    * any read says ``unclear``          -> unclear, lowest confidence (refused)
    * all reads give the same value      -> at least ``AGREED_CONFIDENCE``
    * a majority give the same value     -> ``MAJORITY_CONFIDENCE``
    * no majority                        -> at most 0.5 (a person checks it)

    A read below ``AGREE_FLOOR`` never counts toward agreement. Bboxes come
    from the first agreeing read.
    """
    merged = reads[0].model_copy(deep=True)
    for name in FIELDS:
        setattr(merged, name, _vote([getattr(r, name) for r in reads]))
    heats = []
    for h in reads[0].heats:
        key = _squash(h.heat_no.value or "")
        same = [next((o for o in r.heats if _squash(o.heat_no.value or "") == key), None) for r in reads]
        votes = [o.heat_no if o else h.heat_no.model_copy(update={"status": "read", "value": None, "confidence": 0.0})
                 for o in same]
        qtys = [o.qty for o in same if o and o.qty]
        heats.append(h.model_copy(update={"heat_no": _vote(votes), "qty": _vote(qtys) if qtys else h.qty}))
    merged.heats = heats
    return merged


def _vote(fields: list[SeenField]) -> SeenField:
    first = fields[0]
    if all(f.status == "not_present" for f in fields):
        return first
    if any(f.status == "unclear" for f in fields):
        worst = min((f for f in fields if f.status == "unclear"), key=lambda f: f.confidence)
        return first.model_copy(update={"status": "unclear", "value": None, "confidence": worst.confidence,
                                        "bbox": first.bbox or worst.bbox})
    counted = [f for f in fields if f.status == "read" and _clean(f.value) and f.confidence >= AGREE_FLOOR]
    groups: dict[str, list[SeenField]] = {}
    for f in counted:
        groups.setdefault(_squash(_clean(f.value) or ""), []).append(f)
    if groups:
        best = max(groups.values(), key=len)
        if len(best) == len(fields):
            return best[0].model_copy(update={"confidence": max(AGREED_CONFIDENCE, min(f.confidence for f in best))})
        if len(best) * 2 > len(fields):
            return best[0].model_copy(update={"confidence": MAJORITY_CONFIDENCE})
    return first.model_copy(update={"confidence": min([0.5, *(f.confidence for f in fields)])})


# --------------------------------------------------------------------------
# Scan preparation
# --------------------------------------------------------------------------

SCAN_TARGET_WIDTH = 1500


def prepare_scan(data: bytes, media_type: str, name: str, *, width: int = SCAN_TARGET_WIDTH,
                 gamma: float = 1.6) -> Attachment:
    """Upscale small scans and lift contrast so thin, blurred strokes survive.

    Only the pixels sent to the model change; the cache key stays the
    original file's SHA-256 and citations stay in 0-1 page fractions, so
    bboxes still line up with the original image.
    """
    if not media_type.startswith("image/"):
        return Attachment(data, media_type, name)
    try:
        import pymupdf

        pix = pymupdf.Pixmap(data)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)
        if pix.n > 1:
            pix = pymupdf.Pixmap(pymupdf.csGRAY, pix)
        if pix.width < width:
            scale = width / pix.width
            pix = pymupdf.Pixmap(pix, width, round(pix.height * scale), None)
        pix.gamma_with(gamma)  # darken faint grey text against the paper
        return Attachment(pix.tobytes("png"), "image/png", name)
    except Exception as exc:  # never block extraction on preprocessing
        log.warning("scan preparation failed for %s, sending original: %s", name, exc)
        return Attachment(data, media_type, name)

# --------------------------------------------------------------------------
# Text-layer path: values must appear verbatim in their cited blocks
# --------------------------------------------------------------------------


def _from_text(
    draft: TextEvidenceDraft, blocks: list[Block], doc_id: str, resolve: SupplierResolver
) -> EvidenceExtraction:
    by_id = {b.id: b for b in blocks}
    values: dict[str, str | None] = {}
    conf: dict[str, float] = {}
    cites: dict[str, list[Citation]] = {}
    flags: dict[str, str] = {}

    for name in FIELDS:
        item: TextField = getattr(draft, name)
        cited = [by_id[i] for i in dict.fromkeys(item.block_ids) if i in by_id]
        value = _clean(item.value)
        if value is None:
            values[name] = None  # not printed: absent, no confidence to report
            continue
        if not cited:
            values[name], conf[name] = None, 0.0
            flags[name] = "no valid citation"
            continue
        if not _printed_in(value, cited):
            values[name], conf[name] = None, 0.0
            flags[name] = f"{value!r} is not printed in the cited text"
            continue
        values[name], conf[name] = value, TEXT_LAYER_CONFIDENCE
        cites[name] = [b.citation(doc_id) for b in cited]

    heats: list[tuple[str, str | None, list[Citation], float]] = []
    for h in draft.heats:
        cited = [by_id[i] for i in dict.fromkeys(h.block_ids) if i in by_id]
        heat = _clean(h.heat_no)
        if heat and cited and _printed_in(heat, cited):
            qty = _clean(h.qty)
            if qty is not None and not _printed_in(qty, cited):
                qty = None
            heats.append((heat, qty, [b.citation(doc_id) for b in cited], TEXT_LAYER_CONFIDENCE))
        else:
            flags[f"heat {heat}"] = "heat number not printed in the cited text"

    return _build(draft.doc_kind, doc_id, "text", values, conf, cites, heats, flags, resolve)


# --------------------------------------------------------------------------
# Vision path: the model's legibility confidence gates every value
# --------------------------------------------------------------------------


def _from_vision(draft: VisionEvidenceDraft, doc_id: str, resolve: SupplierResolver) -> EvidenceExtraction:
    values: dict[str, str | None] = {}
    conf: dict[str, float] = {}
    cites: dict[str, list[Citation]] = {}
    flags: dict[str, str] = {}

    for name in FIELDS:
        seen: SeenField = getattr(draft, name)
        citation = _seen_citation(seen, doc_id)
        if seen.status == "not_present" or (_clean(seen.value) is None and citation is None):
            values[name] = None  # not on the document: absent, not unreadable
            continue
        if citation is not None:
            cites[name] = [citation]
        value, c = _clean(seen.value), round(seen.confidence, 3)
        if seen.status == "unclear":
            value = None  # the model says it can't read it; never keep a guess
        conf[name] = c if value is not None else min(c, 0.5)
        if value is None:
            values[name] = None
        elif c < MIN_CONFIDENCE:
            values[name] = None  # read but not trusted
            flags[name] = f"unreadable (confidence {c:.2f} < {MIN_CONFIDENCE})"
        elif citation is None:
            values[name], conf[name] = None, 0.0
            flags[name] = "no valid bbox"
        else:
            values[name] = value

    heats: list[tuple[str, str | None, list[Citation], float]] = []
    for h in draft.heats:
        heat, c = _clean(h.heat_no.value), h.heat_no.confidence
        citation = _seen_citation(h.heat_no, doc_id)
        if heat is None or h.heat_no.status != "read" or c < MIN_CONFIDENCE or citation is None:
            shown = _normalize_heat(heat) if heat else "row"
            flags[f"heat {shown}"] = f"heat number unreadable ({c:.0%} confidence)"
            continue
        qty = _clean(h.qty.value) if h.qty and h.qty.confidence >= MIN_CONFIDENCE else None
        heats.append((heat, qty, [citation], round(c, 3)))

    return _build(draft.doc_kind, doc_id, "vision", values, conf, cites, heats, flags, resolve)


def _seen_citation(seen: SeenField, doc_id: str) -> Citation | None:
    bb = seen.bbox
    if len(bb) != 4 or not all(0 <= v <= 1 for v in bb) or not (bb[0] < bb[2] and bb[1] < bb[3]):
        return None
    return Citation(doc_id=doc_id, page=seen.page, bbox=tuple(round(v, 5) for v in bb), quote=_clean(seen.value))


# --------------------------------------------------------------------------
# Shared
# --------------------------------------------------------------------------


def _build(
    doc_kind: str,
    doc_id: str,
    method: Literal["text", "vision"],
    values: dict[str, str | None],
    conf: dict[str, float],
    cites: dict[str, list[Citation]],
    heats: list[tuple[str, str | None, list[Citation], float]],
    flags: dict[str, str],
    resolve: SupplierResolver,
) -> EvidenceExtraction:
    supplier_name = values.get("supplier_name")
    supplier_id = resolve(supplier_name) if supplier_name else None
    if not supplier_id:
        flags["supplier_id"] = f"supplier {supplier_name!r} not matched"

    base_fields: dict[str, str | int | float | bool | None] = {}
    for name in FIELDS:
        if values.get(name) is None and name not in cites and name not in flags:
            continue  # not on the document at all
        if name != "part_no":  # part_no lives on the item itself
            base_fields[name] = values.get(name)
        base_fields[f"{name}_confidence"] = conf.get(name, 0.0)

    part_no = values.get("part_no") or ""
    if not part_no:
        flags.setdefault("part_no", "part number not read")

    # Overall confidence covers the values that were actually read. An
    # unreadable field is null with its own <field>_confidence, which the
    # rules check per field, so it must not drag down the readable ones.
    read = [conf[n] for n, v in values.items() if v is not None]
    overall = round(min(read), 3) if read else 0.0
    bbox_refs = _unique([c for cs in cites.values() for c in cs])

    def item(batch_id: str | None, extra_cites: list[Citation], extra: dict) -> EvidenceItem:
        fc = dict(cites)
        if extra_cites:
            fc["batch_id"] = extra_cites
        return EvidenceItem(
            supplier_id=supplier_id or "",
            part_no=part_no,
            batch_id=batch_id,
            doc_id=doc_id,
            kind=doc_kind,
            fields={**base_fields, **extra},
            confidence=overall,
            bbox_refs=_unique(bbox_refs + extra_cites),
            field_citations=fc,
        )

    if heats:
        items = [
            item(_normalize_heat(h), hc, {"heat_qty": qty, "batch_id_confidence": hconf})
            for h, qty, hc, hconf in heats
        ]
    else:
        items = [item(None, [], {})]
    return EvidenceExtraction(doc_id, doc_kind, method, items, conf, flags)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    v = " ".join(str(value).split())
    return v or None


def _squash(text: str) -> str:
    return re.sub(r"[\s\-./]", "", text).casefold()


def _printed_in(value: str, blocks: list[Block]) -> bool:
    hay = " ".join(b.text for b in blocks)
    return value.casefold() in hay.casefold() or _squash(value) in _squash(hay)


def _normalize_heat(heat: str) -> str:
    """'SF 24117' and 'sf-24117' both become 'SF-24117'."""
    return re.sub(r"\s+", "-", heat.strip().upper())


def _unique(citations: list[Citation]) -> list[Citation]:
    seen: dict[tuple, Citation] = {}
    for c in citations:
        seen.setdefault((c.page, c.bbox), c)
    return list(seen.values())
