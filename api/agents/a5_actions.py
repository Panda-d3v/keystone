"""T25 - A5 Action Drafter: ranked actions plus a supplier email from a template.

Inputs are rule outputs only: ``DecisionCheck`` (T13) and
``EvidenceStatus`` (T14), plus the names the email needs. Every number on
an action comes from those rule outputs; the model never supplies one.

* ``request_evidence`` - a broken decision whose cheaper alternative is
  blocked by an evidence gap. ``usd_at_stake`` is the annual saving the
  proof would unlock: incumbent cost minus the alternative's cost with
  proof, both computed by ``api/rules/decisions.py``.
* ``review_award`` - a broken decision with no evidence gap to chase.
  ``usd_at_stake`` is the same rule delta, or 0 if no alternative is cheaper.

The supplier email is built from a fixed template that names the part,
every heat/batch and every missing document in plain words. An optional
model "polish" pass may rewrite the wording, but its text is used only if
it still names every one of those facts and adds no new numbers or codes.
Otherwise the template text is used, so the email is always correct.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from pydantic import BaseModel, Field

from contracts.models import Action, DecisionCheck, EvidenceRequirement, EvidenceStatus

from .llm import LLMClient, get_client, sha256_bytes

log = logging.getLogger(__name__)

TASK = "a5_actions"
BUYER = "MeridianFlow"

# What to ask the supplier for, per T14 requirement id, in plain words.
REQUESTS: dict[str, str] = {
    "EV-UK-01": "a legible mill certificate that shows where the iron was melted and poured",
    "origin-declaration": "a signed origin declaration for this part",
    "certificate-origin": "a mill certificate that states the country of origin",
    "heat-batch": "a mill certificate covering each heat number listed above",
    "part-number": "a mill certificate that names our part number",
}
# Short names for the subject line and the facts check.
DOC_NAMES: dict[str, str] = {
    "EV-UK-01": "melt-and-pour certificate",
    "origin-declaration": "origin declaration",
    "certificate-origin": "certificate of origin details",
    "heat-batch": "heat coverage",
    "part-number": "part number on the certificate",
}
WHY: dict[str, str] = {
    "needs_review": "the copy we have is unreadable where it matters",
    "missing": "we have not received it",
    "mismatch": "the copy we have does not match our order",
}


@dataclass(frozen=True)
class EvidenceGap:
    """An evidence passport (T14) plus the names the email needs."""

    status: EvidenceStatus
    supplier_name: str
    part_description: str
    batch_ids: Sequence[str]
    decision: DecisionCheck | None = None
    contact_name: str | None = None


@dataclass
class ActionDraft:
    """The contract ``Action`` plus plain-language text for the action list."""

    action: Action
    title: str
    why: str
    subject: str = ""
    to_supplier: str | None = None
    polished: bool = False
    open_items: list[str] = field(default_factory=list)
    heats: list[str] = field(default_factory=list)


class Polish(BaseModel):
    email: str = Field(description="The rewritten email body")


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def draft_actions(
    decisions: Iterable[DecisionCheck],
    gaps: Iterable[EvidenceGap] = (),
    *,
    start: int = 1,
    polish: bool = False,
    client: LLMClient | None = None,
) -> list[ActionDraft]:
    """Rank and draft the next actions. Highest dollars at stake first."""
    drafts: list[ActionDraft] = []
    gap_decisions: set[str] = set()

    for gap in gaps:
        open_rows = [r for r in gap.status.requirements if r.status != "checked"]
        if gap.status.status == "verified" or not open_rows:
            continue
        if gap.decision is not None:
            gap_decisions.add(gap.decision.decision_id)
        drafts.append(_request_evidence(gap, open_rows))

    for d in decisions:
        if d.status == "broken" and d.decision_id not in gap_decisions:
            drafts.append(_review_award(d))

    drafts.sort(key=lambda a: (-a.action.usd_at_stake, a.action.type, a.action.part_ids))
    for i, draft in enumerate(drafts):
        draft.action = draft.action.model_copy(update={"id": f"ACT-{start + i:04d}", "rank": i + 1})

    if polish:
        c = client or get_client()
        for draft in drafts:
            if draft.to_supplier:
                _polish(draft, c)
    return drafts


def actions(drafts: Iterable[ActionDraft]) -> list[Action]:
    """Just the contract objects, for ``api/routes/store.save_action``."""
    return [d.action for d in drafts]


# --------------------------------------------------------------------------
# Action builders
# --------------------------------------------------------------------------


def _request_evidence(gap: EvidenceGap, open_rows: list[EvidenceRequirement]) -> ActionDraft:
    s = gap.status
    at_stake = _saving(gap.decision)
    heats = sorted(dict.fromkeys(gap.batch_ids))
    asks = [REQUESTS.get(r.id, r.label.lower()) for r in open_rows]
    names = [DOC_NAMES.get(r.id, r.label.lower()) for r in open_rows]

    subject = f"Documents needed for part {s.part_no} ({', '.join(heats)})" if heats else \
        f"Documents needed for part {s.part_no}"
    email = _email(gap, heats, names, asks, open_rows)
    if at_stake > 0 and gap.decision is not None:
        why = (f"Switching {s.part_no} to {gap.supplier_name} would save {_usd(at_stake)} a year, "
               f"but only once we hold the {_join(names)}.")
    else:
        why = f"{gap.supplier_name} still owes us the {_join(names)} for {s.part_no}."
    title = f"Ask {gap.supplier_name} for the {_join(names)}"
    action = Action(id="", rank=0, type="request_evidence", part_ids=[s.part_no],
                    usd_at_stake=at_stake, draft_email=email, title=title, why=why)
    return ActionDraft(action, title=title,
                       why=why, subject=subject, to_supplier=s.supplier_id, open_items=names, heats=heats)


def _review_award(d: DecisionCheck) -> ActionDraft:
    at_stake = _saving(d)
    if at_stake > 0:
        why = f"{d.reason} A documented alternative is {_usd(at_stake)} a year cheaper."
    else:
        why = f"{d.reason} The current supplier is still the cheapest documented option."
    title = f"Review supplier award {d.decision_id}"
    action = Action(id="", rank=0, type="review_award", part_ids=[], usd_at_stake=at_stake, draft_email="",
                    title=title, why=why)
    return ActionDraft(action, title=title, why=why)


def _saving(d: DecisionCheck | None) -> float:
    """Rule delta only: incumbent annual cost minus the alternative with proof."""
    if d is None:
        return 0.0
    return max(0.0, round(float(d.incumbent_annual_usd) - float(d.alternative_with_proof_annual_usd), 2))


# --------------------------------------------------------------------------
# Email template
# --------------------------------------------------------------------------


def _email(
    gap: EvidenceGap, heats: list[str], names: list[str], asks: list[str], rows: list[EvidenceRequirement]
) -> str:
    s = gap.status
    greeting = f"Hello {gap.contact_name}," if gap.contact_name else f"Hello {gap.supplier_name} team,"
    lines = [
        greeting,
        "",
        f"We are reviewing our supply of part {s.part_no} ({gap.part_description}).",
    ]
    if heats:
        lines.append(f"Heat numbers: {', '.join(heats)}.")
    lines += ["", "To complete our compliance file, please send:"]
    for name, ask, row in zip(names, asks, rows):
        reason = WHY.get(row.status)
        lines.append(f"- {name[0].upper()}{name[1:]}: {ask}" + (f" ({reason})." if reason else "."))
    lines += [
        "",
        "Please reply with the documents attached. A clear scan or PDF is fine.",
        "",
        "Thank you,",
        f"{BUYER} Sourcing",
    ]
    return "\n".join(lines)


def required_facts(draft: ActionDraft) -> list[str]:
    """Strings the email must contain: part, every heat, every requested document."""
    return [*draft.action.part_ids, *draft.heats, *draft.open_items]


# --------------------------------------------------------------------------
# Optional polish, verified
# --------------------------------------------------------------------------


def _polish(draft: ActionDraft, client: LLMClient) -> None:
    template = draft.action.draft_email
    try:
        out = client.extract(
            Polish,
            task=TASK,
            system=("You edit supplier emails for a procurement team. Keep every part number, "
                    "heat number and requested document exactly. Do not add facts, numbers, "
                    "dates, prices or deadlines."),
            prompt=f"Make this email polite, clear and brief. Keep the bullet list.\n\n{template}",
            file_sha256=sha256_bytes(template.encode()),
            tier="large",
            max_tokens=2048,
        )
    except Exception as exc:
        log.info("A5 polish unavailable, using template: %s", exc)
        return
    if _safe_rewrite(template, out.email, required_facts(draft)):
        draft.action = draft.action.model_copy(update={"draft_email": out.email.strip()})
        draft.polished = True
    else:
        log.warning("A5 polish dropped a fact or added a number; using template")


def _safe_rewrite(template: str, candidate: str, facts: Sequence[str]) -> bool:
    low = candidate.casefold()
    if not candidate.strip() or any(f.casefold() not in low for f in facts):
        return False
    return _numeric_tokens(candidate) <= _numeric_tokens(template)


def _numeric_tokens(text: str) -> set[str]:
    """Every code, number, date or amount in the text (anything with a digit)."""
    words = (w.strip(".-,;:()") for w in re.findall(r"[\w$][\w.\-/,$]*", text))
    return {w.casefold() for w in words if any(ch.isdigit() for ch in w)}


# --------------------------------------------------------------------------
# Formatting
# --------------------------------------------------------------------------


def _usd(v: float) -> str:
    return f"${v:,.0f}"


def _join(items: Sequence[str]) -> str:
    items = list(items)
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]
