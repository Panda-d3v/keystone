"""T25 done-when: the email names the part, both heats and both missing documents."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from api.agents.a5_actions import EvidenceGap, actions, draft_actions, required_facts
from api.agents.llm import LLMClient
from contracts.models import Action, DecisionCheck, EvidenceStatus

FIX = Path(__file__).resolve().parents[2] / "contracts" / "fixtures"
DECISION = DecisionCheck.model_validate(json.loads((FIX / "decisions.json").read_text())[0])
SHEFFIELD = EvidenceStatus.model_validate(json.loads((FIX / "evidence.json").read_text()))
HEATS = ["SF-24117", "SF-24121"]
DESC = "Pump casing, ductile iron, ANSI B73.1, size 3x2-10"


def _gap(**kw) -> EvidenceGap:
    base = dict(status=SHEFFIELD, supplier_name="Sheffield Forge & Pattern Ltd",
                part_description=DESC, batch_ids=HEATS, decision=DECISION)
    return EvidenceGap(**{**base, **kw})


class Polisher:
    def __init__(self, text):
        self.text, self.calls = text, 0

    def generate(self, request):
        self.calls += 1
        return {"email": self.text}


# --- done-when ---------------------------------------------------------------


def test_email_names_part_both_heats_and_both_missing_documents():
    [draft] = draft_actions([DECISION], [_gap()])
    email = draft.action.draft_email

    assert "MF-8413-005" in email
    assert "SF-24117" in email and "SF-24121" in email
    assert "Melt-and-pour certificate" in email and "melted and poured" in email
    assert "Origin declaration" in email
    # The three checked requirements are not asked for again.
    assert "country of origin" not in email and "names our part number" not in email
    for fact in required_facts(draft):
        assert fact.casefold() in email.casefold()


def test_action_matches_contract_and_rule_numbers():
    [draft] = draft_actions([DECISION], [_gap()])
    a = draft.action
    Action.model_validate(a.model_dump())
    assert (a.id, a.rank, a.type, a.part_ids) == ("ACT-0001", 1, "request_evidence", ["MF-8413-005"])
    # $1,192,560 incumbent - $1,142,870 Sheffield with proof, from T13. Matches actions.json.
    assert a.usd_at_stake == 49690
    assert draft.to_supplier == "S007"


def test_business_readable_title_and_reason():
    [draft] = draft_actions([DECISION], [_gap()])
    assert draft.title == "Ask Sheffield Forge & Pattern Ltd for the melt-and-pour certificate and origin declaration"
    assert draft.why.startswith("Switching MF-8413-005 to Sheffield Forge & Pattern Ltd would save $49,690 a year")
    assert draft.subject == "Documents needed for part MF-8413-005 (SF-24117, SF-24121)"
    email = draft.action.draft_email
    assert email.startswith("Hello Sheffield Forge & Pattern Ltd team,")
    assert "unreadable where it matters" in email and "we have not received it" in email
    assert "EV-UK-01" not in email  # internal codes stay internal


# --- ranking -----------------------------------------------------------------


def test_ranked_by_dollars_at_stake():
    other = DECISION.model_copy(update={
        "decision_id": "D-2026-099", "incumbent_annual_usd": 500_000,
        "alternative_with_proof_annual_usd": 400_000, "alternative_without_proof_annual_usd": 450_000})
    drafts = draft_actions([DECISION, other], [_gap()])
    assert [(d.action.type, d.action.usd_at_stake) for d in drafts] == [
        ("review_award", 100000), ("request_evidence", 49690)]
    assert [d.action.rank for d in drafts] == [1, 2]
    assert [d.action.id for d in drafts] == ["ACT-0001", "ACT-0002"]
    assert "100,000 a year cheaper" in drafts[0].why


def test_no_duplicate_review_when_evidence_request_covers_decision():
    drafts = draft_actions([DECISION], [_gap()])
    assert [d.action.type for d in drafts] == ["request_evidence"]


def test_verified_passport_needs_no_action():
    ok = SHEFFIELD.model_copy(update={
        "status": "verified", "missing_requirements": [],
        "requirements": [r.model_copy(update={"status": "checked"}) for r in SHEFFIELD.requirements]})
    assert draft_actions([], [_gap(status=ok, decision=None)]) == []


def test_store_ready_actions():
    assert [a.id for a in actions(draft_actions([DECISION], [_gap()], start=7))] == ["ACT-0007"]


# --- optional polish is verified -------------------------------------------


def _polished(tmp_path, text):
    client = LLMClient(Polisher(text), cache_dir=tmp_path / "c", replay=False)
    [draft] = draft_actions([DECISION], [_gap(contact_name="R. Hartley")], polish=True, client=client)
    return draft


def test_polish_accepted_when_facts_kept(tmp_path):
    text = ("Dear R. Hartley,\n\nFor part MF-8413-005 (heats SF-24117 and SF-24121), could you send:\n"
            "- Melt-and-pour certificate showing where the iron was melted and poured\n"
            "- Origin declaration\n\nMany thanks,\nMeridianFlow Sourcing")
    d = _polished(tmp_path, text)
    assert d.polished and d.action.draft_email == text.strip()


def test_polish_rejected_when_a_heat_is_dropped(tmp_path):
    d = _polished(tmp_path, "Please send the melt-and-pour certificate and origin declaration for MF-8413-005, heat SF-24117.")
    assert not d.polished and "SF-24121" in d.action.draft_email


@pytest.mark.parametrize("added", ["by 2026-12-01", "for $49,690", "and PO-4504"])
def test_polish_rejected_when_it_adds_numbers(tmp_path, added):
    text = ("Please send the melt-and-pour certificate and origin declaration for MF-8413-005 "
            f"(SF-24117, SF-24121) {added}.")
    d = _polished(tmp_path, text)
    assert not d.polished


def test_polish_offline_falls_back_to_template(tmp_path):
    class Down:
        def generate(self, r):
            raise RuntimeError("offline")

    client = LLMClient(Down(), cache_dir=tmp_path / "c", replay=False)
    [d] = draft_actions([DECISION], [_gap()], polish=True, client=client)
    assert not d.polished and "SF-24121" in d.action.draft_email
