"""The five agents as one pipeline, with plain-language results.

``AgentPipeline.ingest(data, filename)`` runs one upload through:

    A1 intake  ->  bulletin PDF       -> A2 change extractor
               ->  supplier document  -> A3 evidence extractor
                                         + A4 matcher (supplier and part ids)

Each document comes back as a ``DocOutcome`` holding the contract objects
for the API layer (``DocEnvelope``, ``ChangeEvent``, ``EvidenceItem``) and
two things written for business users:

* ``summary``: one or two sentences on what the document says.
* ``review``: plain reasons a person needs to look before it is trusted.

A5 runs after the rules engine (T13/T14) has scored decisions and
evidence; ``draft_next_actions`` is the hand-off.

The pipeline never writes to the database and never computes exposure,
decision or evidence numbers. T40 owns persistence; ``api/rules`` owns
the numbers.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Callable, Iterable

from contracts.models import ChangeEvent, DecisionCheck, EvidenceItem

from .a1_intake import IntakeResult, route_bytes
from .a2_change import ChangeExtraction, extract_change
from .a3_evidence import MIN_CONFIDENCE, EvidenceExtraction, extract_evidence
from .a4_match import EntityMatcher, MatchResult
from .a5_actions import ActionDraft, EvidenceGap, draft_actions
from .llm import LLMClient, get_client

log = logging.getLogger(__name__)

KIND_NAMES = {
    "bulletin": "Tariff bulletin",
    "supplier_document": "Supplier document",
    "unknown": "Unrecognized document",
}
FIELD_NAMES = {
    "measure": "the measure name",
    "hts_scope": "the affected HTS codes",
    "old_rate": "the old rate",
    "new_rate": "the new rate",
    "effective_date": "the effective date",
    "basis": "what the duty is charged on",
    "countries": "the countries covered",
    "supplier_name": "the supplier name",
    "supplier_id": "the supplier",
    "certificate_no": "the certificate number",
    "issue_date": "the issue date",
    "customer_po": "the purchase order",
    "part_no": "the part number",
    "material_spec": "the material grade",
    "hs_code": "the HS code",
    "country_of_origin": "the country of origin",
    "melt_location": "where the iron was melted and poured",
}


@dataclass
class DocOutcome:
    intake: IntakeResult
    summary: str
    review: list[str] = field(default_factory=list)
    change: ChangeEvent | None = None
    change_extraction: ChangeExtraction | None = None
    evidence: list[EvidenceItem] = field(default_factory=list)
    evidence_extraction: EvidenceExtraction | None = None
    supplier_match: MatchResult | None = None
    part_match: MatchResult | None = None

    @property
    def doc_id(self) -> str:
        return self.intake.envelope.doc_id

    @property
    def needs_review(self) -> bool:
        return bool(self.review)


class AgentPipeline:
    def __init__(
        self,
        matcher: EntityMatcher,
        *,
        client: LLMClient | None = None,
        next_change_id: Callable[[], str] | None = None,
    ):
        self.matcher = matcher
        self.client = client or get_client()
        self._next_change_id = next_change_id or _counter("CE-{:04d}", 7)

    # -- ingest -------------------------------------------------------------

    def ingest(self, data: bytes, filename: str) -> list[DocOutcome]:
        outcomes: list[DocOutcome] = []
        for doc in route_bytes(data, filename, client=self.client):
            kind, media = doc.envelope.kind, doc.envelope.media_type
            try:
                if kind == "bulletin" and media == "application/pdf":
                    outcomes.append(self._bulletin(doc))
                elif kind == "supplier_document" and (media == "application/pdf" or media.startswith("image/")):
                    outcomes.append(self._supplier_doc(doc))
                else:
                    outcomes.append(self._other(doc))
            except Exception as exc:  # one bad attachment must not sink the upload
                log.exception("pipeline failed on %s", doc.envelope.doc_id)
                outcomes.append(DocOutcome(
                    doc, summary=f"{doc.envelope.filename} could not be read automatically.",
                    review=[f"Reading failed ({type(exc).__name__}). Please open the file and enter the details."],
                ))
        return outcomes

    # -- per kind -----------------------------------------------------------

    def _bulletin(self, doc: IntakeResult) -> DocOutcome:
        ex = extract_change(doc, change_id=self._next_change_id(), client=self.client)
        review = [f"Could not confirm {FIELD_NAMES.get(k, k)}: {v}." for k, v in ex.flags.items()]
        if ex.change is not None:
            summary = describe_change(ex.change, doc.envelope.doc_id)
        else:
            summary = f"Tariff bulletin {doc.envelope.doc_id}: some details could not be confirmed from the document."
        return DocOutcome(doc, summary, review, change=ex.change, change_extraction=ex)

    def _supplier_doc(self, doc: IntakeResult) -> DocOutcome:
        supplier_matches: dict[str, MatchResult] = {}

        def resolve(name: str) -> str | None:
            r = self.matcher.match_supplier(name)
            supplier_matches[name] = r
            return r.match.entity_id if r.match else None

        ex = extract_evidence(doc, resolve_supplier=resolve, client=self.client)
        supplier_match = next(iter(supplier_matches.values()), None)

        # Link the printed part number to the parts table (A4).
        part_match = None
        items = ex.items
        printed_part = items[0].part_no if items else ""
        if printed_part:
            part_match = self.matcher.match_part(printed_part)
            if part_match.match:
                items = [i.model_copy(update={"part_no": part_match.match.entity_id}) for i in items]

        review: list[str] = []
        if doc.needs_review:
            review.append(f"The document type was a guess ({doc.reason}). Please confirm it is a supplier document.")
        if supplier_match and not supplier_match.match:
            review.append(supplier_match.explain(self.matcher))
        elif not supplier_match:
            review.append("No supplier name could be read.")
        if part_match and not part_match.match:
            review.append(part_match.explain(self.matcher))
        for name in ex.low_confidence_fields:
            review.append(
                f"{_cap(FIELD_NAMES.get(name, name))} is unreadable "
                f"({ex.field_confidence[name]:.0%} confidence, {MIN_CONFIDENCE:.0%} needed). "
                "It will not be used until a clear copy arrives."
            )
        for key, msg in ex.flags.items():
            if key in ex.low_confidence_fields or key == "supplier_id":
                continue
            review.append(f"{_cap(FIELD_NAMES.get(key, key))}: {msg}.")

        return DocOutcome(
            doc, describe_evidence(ex, items, self.matcher), review,
            evidence=items, evidence_extraction=ex,
            supplier_match=supplier_match, part_match=part_match,
        )

    def _other(self, doc: IntakeResult) -> DocOutcome:
        env = doc.envelope
        if env.media_type == "message/rfc822":
            n = len(env.attachment_ids)
            attached = f" with {n} attachment{'s' if n != 1 else ''}" if n else ""
            summary = f"Email{attached}" + (f": {', '.join(env.attachment_ids)}." if n else ".")
            return DocOutcome(doc, summary)
        if env.kind == "unknown":
            return DocOutcome(doc, f"{env.filename} was not recognized as a bulletin or supplier document.",
                              ["Please check what this file is and file it by hand."])
        return DocOutcome(doc, f"{KIND_NAMES[env.kind]} {env.doc_id} received.",
                          [f"{KIND_NAMES[env.kind]}s in this format can't be read automatically yet."])

    # -- A5 hand-off ------------------------------------------------------------

    def draft_next_actions(
        self,
        decisions: Iterable[DecisionCheck],
        gaps: Iterable[EvidenceGap] = (),
        *,
        polish: bool = False,
        start: int = 1,
    ) -> list[ActionDraft]:
        return draft_actions(decisions, gaps, polish=polish, start=start, client=self.client)


# --------------------------------------------------------------------------
# Plain-language descriptions
# --------------------------------------------------------------------------


def describe_change(change: ChangeEvent, doc_id: str) -> str:
    codes = [_hts(c) for c in change.hts_scope]
    where = f" for goods from {', '.join(change.countries)}" if change.countries else ""
    basis = {"full_customs_value": " on the full customs value",
             "metal_content": " on the metal content only"}.get(change.basis, "")
    heading, verb = ("heading", "moves") if len(codes) == 1 else ("headings", "move")
    return (f"Tariff bulletin {doc_id}: {len(codes)} HTS {heading} ({', '.join(codes)}) {verb} from "
            f"{_pct(change.old_rate)} to {_pct(change.new_rate)}{basis}{where}, "
            f"starting {_date(change.effective_date)}.")


def describe_evidence(ex: EvidenceExtraction, items: list[EvidenceItem], matcher: EntityMatcher) -> str:
    if not items:
        return "Supplier document with nothing readable."
    first = items[0]
    kind = {"mill_certificate": "Mill certificate", "origin_declaration": "Origin declaration"}.get(
        ex.doc_kind, "Supplier document")
    supplier = matcher.label(first.supplier_id) if first.supplier_id else ""
    who = f" from {supplier} ({first.supplier_id})" if supplier else ""
    part = f" for part {first.part_no}" if first.part_no else ""
    heats = [i.batch_id for i in items if i.batch_id]
    heat_txt = f", heats {_and(heats)}" if heats else ""
    melt = first.fields.get("melt_location")
    if "melt_location_confidence" in first.fields:
        if melt:
            melt_txt = f" Melted and poured in {melt}."
        else:
            melt_txt = (f" Where the iron was melted and poured is unreadable "
                        f"({first.fields['melt_location_confidence']:.0%} confidence).")
    else:
        melt_txt = ""
    origin = first.fields.get("country_of_origin")
    origin_txt = f" Country of origin: {origin}." if origin else ""
    return f"{kind}{who}{part}{heat_txt}.{origin_txt}{melt_txt}"


def _hts(code: str) -> str:
    return f"{code[:4]}.{code[4:6]}" + (f".{code[6:]}" if len(code) > 6 else "") if len(code) >= 6 else code


def _pct(v: float) -> str:
    return f"{v * 100:g}%"


def _date(d: date) -> str:
    return f"{d:%B} {d.day}, {d.year}"


def _and(items: list[str]) -> str:
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def _counter(fmt: str, start: int) -> Callable[[], str]:
    n = [start - 1]

    def nxt() -> str:
        n[0] += 1
        return fmt.format(n[0])

    return nxt
