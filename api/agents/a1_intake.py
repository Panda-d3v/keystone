"""T21 - A1 Intake Router.

Takes a dropped or forwarded file (.eml, PDF, scan image, CSV/XLSX, text),
unpacks email attachments, and classifies every part into a
``contracts.models.DocEnvelope`` with ``kind`` in
``bulletin | supplier_document | unknown``.

Classification order, cheapest and most deterministic first:

1. Keyword rules over the text layer (email subject + body, PDF text of
   the first 2 pages, CSV header). No model call.
2. If the text is missing or inconclusive (scans, image-only PDFs): the
   small fast LLM on the first 2 pages, through ``api.agents.llm`` so the
   result is cached by file SHA-256 and replayable offline.
3. If the LLM is unavailable (no key, or replay cache miss): a weak
   filename hint, flagged ``needs_review``.
4. Otherwise ``unknown``, which goes to the review queue.

Every result below ``REVIEW_THRESHOLD`` confidence is ``needs_review``.
The router only labels documents; it never extracts or computes values.
"""

from __future__ import annotations

import email
import email.policy
import logging
import re
from dataclasses import dataclass, field
from email.message import EmailMessage
from pathlib import Path
from typing import Literal, Union

from pydantic import BaseModel, Field

from contracts.models import DocEnvelope

from .llm import Attachment, LLMClient, LLMError, get_client, sha256_bytes

log = logging.getLogger(__name__)

Kind = Literal["bulletin", "supplier_document", "unknown"]
Method = Literal["rules", "llm", "filename", "none"]

TASK = "a1_intake"
REVIEW_THRESHOLD = 0.6
MAX_PAGES = 2

_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".eml": "message/rfc822",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

# Weighted phrases. Weights favour phrases that only one kind would use:
# a mill cert mentions "HS code" and "country of origin" too, so those
# generic trade words are deliberately absent or low-weight.
_SIGNALS: dict[str, dict[str, float]] = {
    "bulletin": {
        "proclamation": 2,
        "section 232": 2,
        "section 301": 2,
        "trade advisory": 2,
        "client alert": 2,
        "federal register": 2,
        "annex i-a": 2,
        "annex i-b": 2,
        "entered for consumption": 2,
        "withdrawn from warehouse": 2,
        "tariff": 1,
        "duty rate": 1,
        "tier": 1,
        "effective": 0.5,
    },
    "supplier_document": {
        "inspection certificate": 2,
        "mill certificate": 2,
        "mill test report": 2,
        "en 10204": 2,
        "certificate of origin": 2,
        "origin declaration": 2,
        "declaration of origin": 2,
        "melt location": 2,
        "melted and poured": 2,
        "heat no": 1,
        "heat / batch": 1,
        "chemical composition": 1,
        "mechanical properties": 1,
        "certificate no": 1,
    },
}
RULE_MIN_SCORE = 3.0  # need at least this much evidence for one kind
RULE_MARGIN = 2.0  # and this much more than the other kind

_FILENAME_HINTS: dict[str, tuple[str, ...]] = {
    "supplier_document": ("mill_cert", "millcert", "certificate", "cert_", "origin_decl", "coo"),
    "bulletin": ("bulletin", "advisory", "proclamation", "notice", "alert"),
}
FILENAME_CONFIDENCE = 0.5  # always below REVIEW_THRESHOLD

_DOC_REF = re.compile(r"^([A-Z]{2,}-\d{4}-\d+)(?:[_\s-]|$)")


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------


@dataclass
class IntakeResult:
    """One classified document plus the bytes downstream agents need.

    ``envelope`` is the contract object. The rest is router metadata for
    the intake queue (confidence badge, review flag) and is not part of
    the API contract.
    """

    envelope: DocEnvelope
    confidence: float
    method: Method
    reason: str
    content: bytes = field(repr=False)
    text: str = field(default="", repr=False)
    parent_id: str | None = None

    @property
    def needs_review(self) -> bool:
        return self.envelope.kind == "unknown" or self.confidence < REVIEW_THRESHOLD


class IntakeClassification(BaseModel):
    """Structured output the small model fills in for A1."""

    kind: Kind = Field(
        description="bulletin = regulatory/tariff notice or trade advisory; "
        "supplier_document = mill/inspection certificate, origin declaration or other "
        "supplier compliance paper; unknown = anything else"
    )
    confidence: float = Field(ge=0, le=1, description="How sure you are, 0 to 1")
    reason: str = Field(description="One short sentence naming the visible cue you used")


SYSTEM_PROMPT = (
    "You route incoming documents for an industrial procurement team. "
    "Look only at what is visible in the document. Do not guess from the file name."
)
USER_PROMPT = (
    "Classify this document as bulletin, supplier_document or unknown. "
    "A bulletin is a tariff, trade or regulatory notice. A supplier_document is a "
    "mill or inspection certificate, origin declaration or similar supplier paper, "
    "even when it is a blurry or skewed scan. If you cannot tell, answer unknown "
    "with low confidence."
)


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def route_file(path: Union[str, Path], *, client: LLMClient | None = None) -> list[IntakeResult]:
    p = Path(path)
    return route_bytes(p.read_bytes(), p.name, client=client)


def route_bytes(data: bytes, filename: str, *, client: LLMClient | None = None) -> list[IntakeResult]:
    """Classify a file. An .eml returns the email first, then each attachment."""
    media_type = guess_media_type(filename)
    if media_type == "message/rfc822":
        return _route_email(data, filename, client)
    return [_classify(data, filename, media_type, client=client)]


def guess_media_type(filename: str) -> str:
    return _MEDIA_TYPES.get(Path(filename).suffix.lower(), "application/octet-stream")


def make_doc_id(filename: str) -> str:
    """Stable doc id: a leading reference number (``HTA-2026-118``) or the file stem."""
    stem = Path(filename).stem
    m = _DOC_REF.match(stem)
    return m.group(1) if m else stem


# --------------------------------------------------------------------------
# Email
# --------------------------------------------------------------------------


def _route_email(data: bytes, filename: str, client: LLMClient | None) -> list[IntakeResult]:
    msg = email.message_from_bytes(data, policy=email.policy.default)
    assert isinstance(msg, EmailMessage)

    children: list[IntakeResult] = []
    for part in msg.iter_attachments():
        payload = part.get_payload(decode=True)
        name = part.get_filename()
        if not payload or not name:
            continue
        media_type = part.get_content_type()
        if media_type == "application/octet-stream":
            media_type = guess_media_type(name)
        if media_type == "message/rfc822":
            children.extend(_route_email(payload, name, client))
        else:
            children.append(_classify(payload, name, media_type, client=client))

    body = msg.get_body(preferencelist=("plain", "html"))
    body_text = body.get_content() if body is not None else ""
    subject = str(msg.get("subject", ""))
    text = f"{subject}\n{body_text}"

    parent = _classify(
        data,
        filename,
        "message/rfc822",
        client=client,
        text=text,
        attachment_ids=[c.envelope.doc_id for c in children],
    )
    # A cover email with no signal of its own inherits its strongest attachment.
    if parent.envelope.kind == "unknown" and children:
        best = max(children, key=lambda c: (c.envelope.kind != "unknown", c.confidence))
        if best.envelope.kind != "unknown":
            parent = _with_kind(parent, best.envelope.kind, best.confidence, best.method,
                                f"inherited from attachment {best.envelope.doc_id}")
    for c in children:
        c.parent_id = parent.envelope.doc_id
    return [parent, *children]


# --------------------------------------------------------------------------
# Classification
# --------------------------------------------------------------------------


def _classify(
    data: bytes,
    filename: str,
    media_type: str,
    *,
    client: LLMClient | None,
    text: str | None = None,
    attachment_ids: list[str] | None = None,
) -> IntakeResult:
    sha = sha256_bytes(data)
    if text is None:
        text = extract_text(data, media_type)

    def result(kind: Kind, confidence: float, method: Method, reason: str) -> IntakeResult:
        env = DocEnvelope(
            doc_id=make_doc_id(filename),
            filename=filename,
            media_type=media_type,
            sha256=sha,
            kind=kind,
            attachment_ids=attachment_ids or [],
        )
        return IntakeResult(env, round(confidence, 3), method, reason, data, text)

    ruled = classify_text(text)
    if ruled is not None:
        return result(*ruled, "rules", _rule_reason(text, ruled[0]))

    if _llm_can_read(media_type):
        try:
            out = _classify_llm(data, filename, media_type, sha, client or get_client())
            kind: Kind = out.kind if out.confidence >= REVIEW_THRESHOLD else "unknown"
            return result(kind, out.confidence, "llm", out.reason)
        except LLMError as exc:
            log.warning("A1 LLM unavailable for %s: %s", filename, exc)
        except Exception as exc:  # network, auth, SDK missing: degrade, never crash intake
            log.warning("A1 LLM call failed for %s: %s", filename, exc)

    hinted = classify_filename(filename)
    if hinted is not None:
        return result(hinted, FILENAME_CONFIDENCE, "filename",
                      "no readable text and no model available; file name suggests this type")
    return result("unknown", 0.0, "none", "no readable text and no classifier signal")


def classify_text(text: str) -> tuple[Kind, float] | None:
    """Keyword rules. Returns (kind, confidence) or None when inconclusive."""
    if not text or len(text.strip()) < 40:
        return None
    scores = score_text(text)
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    (top, top_score), (_, runner_up) = ranked[0], ranked[1]
    if top_score < RULE_MIN_SCORE or top_score - runner_up < RULE_MARGIN:
        return None
    confidence = min(0.99, 0.7 + 0.04 * (top_score - runner_up))
    return top, confidence  # type: ignore[return-value]


def score_text(text: str) -> dict[str, float]:
    low = " ".join(text.lower().split())
    return {
        kind: sum(w for phrase, w in phrases.items() if phrase in low)
        for kind, phrases in _SIGNALS.items()
    }


def classify_filename(filename: str) -> Kind | None:
    low = filename.lower()
    for kind, hints in _FILENAME_HINTS.items():
        if any(h in low for h in hints):
            return kind  # type: ignore[return-value]
    return None


def _rule_reason(text: str, kind: str) -> str:
    low = " ".join(text.lower().split())
    hits = [p for p in _SIGNALS[kind] if p in low]
    return "matched: " + ", ".join(hits[:4])


def _llm_can_read(media_type: str) -> bool:
    return media_type == "application/pdf" or media_type.startswith("image/")


def _classify_llm(
    data: bytes, filename: str, media_type: str, sha: str, client: LLMClient
) -> IntakeClassification:
    attachment_data = _first_pages_pdf(data) if media_type == "application/pdf" else data
    att = Attachment(data=attachment_data, media_type=media_type, name=filename)
    return client.extract(
        IntakeClassification,
        task=TASK,
        system=SYSTEM_PROMPT,
        prompt=USER_PROMPT,
        file_sha256=sha,
        attachments=[att],
        tier="small",
        max_tokens=1024,
    )


def _with_kind(r: IntakeResult, kind: Kind, confidence: float, method: Method, reason: str) -> IntakeResult:
    env = r.envelope.model_copy(update={"kind": kind})
    return IntakeResult(env, confidence, method, reason, r.content, r.text, r.parent_id)


# --------------------------------------------------------------------------
# Text extraction
# --------------------------------------------------------------------------


def extract_text(data: bytes, media_type: str, max_pages: int = MAX_PAGES) -> str:
    if media_type == "application/pdf":
        return _pdf_text(data, max_pages)
    if media_type.startswith("text/"):
        return data[:20000].decode("utf-8", errors="replace")
    return ""  # images, xlsx: no text layer here


def _pdf_text(data: bytes, max_pages: int) -> str:
    try:
        import pymupdf
    except ImportError:  # pragma: no cover - dependency missing
        log.warning("pymupdf not installed; PDF text layer unavailable")
        return ""
    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            return "\n".join(doc[i].get_text() for i in range(min(max_pages, doc.page_count)))
    except Exception as exc:
        log.warning("could not read PDF text: %s", exc)
        return ""


def _first_pages_pdf(data: bytes, max_pages: int = MAX_PAGES) -> bytes:
    """Trim a PDF to its first pages so routing stays cheap."""
    try:
        import pymupdf

        with pymupdf.open(stream=data, filetype="pdf") as doc:
            if doc.page_count <= max_pages:
                return data
            out = pymupdf.open()
            out.insert_pdf(doc, from_page=0, to_page=max_pages - 1)
            return out.tobytes()
    except Exception:
        return data
