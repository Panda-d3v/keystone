"""T22 done-when: 6 fields match the bulletin; each has page + bbox."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import pytest

from api.agents.a1_intake import route_file
from api.agents.a2_change import ChangeDraft, assemble, extract_change, pdf_blocks
from api.agents.llm import LLMClient, LLMRequest
from contracts.models import ChangeEvent

ROOT = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).parent / "fixtures" / "demo_docs"
EML = DOCS / "01_bulletin_email_HTA-2026-118.eml"
BULLETIN = DOCS / "HTA-2026-118_trade_advisory.pdf"
FIXTURE = json.loads((ROOT / "contracts" / "fixtures" / "changes.json").read_text())[0]
SIX = ("measure", "hts_scope", "old_rate", "new_rate", "effective_date", "basis")

# What a correct model answer looks like: values plus the ids of the
# numbered blocks that state them (block 4 = headline, 5 = summary,
# 8 = HTS table, 9 = basis paragraph). Coordinates and quotes are never
# taken from the model.
GOOD = {
    "measure": {"value": "Illustrative Section 232 bulletin HTA-2026-118", "block_ids": [4]},
    "hts_scope": {"value": ["8413.91", "8481.30", "8481.80", "8483.30"], "block_ids": [8]},
    "countries": {"value": [], "block_ids": []},
    "old_rate": {"value": 0.25, "block_ids": [5]},
    "new_rate": {"value": 0.5, "block_ids": [5]},
    "effective_date": {"value": "2026-12-01", "block_ids": [5]},
    "basis": {"value": "full_customs_value", "block_ids": [9]},
}


class ModelStub:
    def __init__(self, answer=None):
        self.answer = answer or GOOD
        self.calls: list[LLMRequest] = []

    def generate(self, request):
        self.calls.append(request)
        return json.loads(json.dumps(self.answer))


def _client(tmp_path, answer=None):
    stub = ModelStub(answer)
    return stub, LLMClient(stub, cache_dir=tmp_path / "cache", replay=False)


def _blocks():
    return pdf_blocks(BULLETIN.read_bytes())


def _with(**changes):
    answer = json.loads(json.dumps(GOOD))
    for k, v in changes.items():
        answer[k] = v
    return ChangeDraft.model_validate(answer)


# --- done-when -------------------------------------------------------------


def test_six_fields_match_fixture_with_page_and_bbox(tmp_path):
    stub, client = _client(tmp_path)
    [_, pdf] = route_file(EML, client=client)  # A1 -> A2, as in the demo
    out = extract_change(pdf, change_id="CE-0007", client=client)

    assert not out.flags and out.change is not None
    ChangeEvent.model_validate(out.change.model_dump())
    got = out.change.model_dump(mode="json")
    for name in SIX:
        assert got[name] == FIXTURE[name], name
        assert got["field_citations"][name] == FIXTURE["field_citations"][name], name
        for c in out.change.field_citations[name]:
            assert c.doc_id == "HTA-2026-118" and c.page >= 1
            assert len(c.bbox) == 4 and all(0 <= v <= 1 for v in c.bbox)
            assert c.bbox[0] < c.bbox[2] and c.bbox[1] < c.bbox[3]
    assert got["countries"] == FIXTURE["countries"] == []
    assert len(stub.calls) == 1 and stub.calls[0].model == client.models["large"]


def test_block_bboxes_are_normalized_top_left():
    b = {x.id: x for x in _blocks()}
    assert b[4].text.startswith("Illustrative scenario")
    assert b[4].bbox == (0.08824, 0.13513, 0.89301, 0.18219)
    assert b[1].bbox[1] < b[14].bbox[1]  # header above footer


def test_second_run_makes_zero_model_calls(tmp_path):
    stub, client = _client(tmp_path)
    data = BULLETIN.read_bytes()
    extract_change(data, doc_id="HTA-2026-118", change_id="CE-0007", client=client)
    again = LLMClient(stub, cache_dir=tmp_path / "cache", replay=False)
    out = extract_change(data, doc_id="HTA-2026-118", change_id="CE-0007", client=again)
    assert out.change is not None and again.stats.model_calls == 0


# --- trust checks: unsupported values are nulled and flagged ---------------


def test_value_not_in_cited_text_is_flagged():
    out = assemble(_with(new_rate={"value": 0.35, "block_ids": [5]}), _blocks(), doc_id="HTA-2026-118", change_id="X")
    assert out.change is None
    assert out.values["new_rate"] is None
    assert "35% not in cited text" in out.flags["new_rate"]


def test_wrong_block_is_flagged():
    # The basis paragraph does not state the effective date.
    out = assemble(_with(effective_date={"value": "2026-12-01", "block_ids": [9]}), _blocks(),
                   doc_id="HTA-2026-118", change_id="X")
    assert "effective_date" in out.flags and out.change is None


def test_missing_or_bogus_citation_is_flagged():
    out = assemble(_with(basis={"value": "full_customs_value", "block_ids": [99]}), _blocks(),
                   doc_id="HTA-2026-118", change_id="X")
    assert out.flags["basis"] == "no valid citation"


def test_hts_code_not_in_table_is_flagged():
    out = assemble(_with(hts_scope={"value": ["8413.91", "7307.91"], "block_ids": [8]}), _blocks(),
                   doc_id="HTA-2026-118", change_id="X")
    assert "7307.91" in out.flags["hts_scope"]


def test_unstated_field_is_null_and_flagged():
    out = assemble(_with(effective_date={"value": None, "block_ids": []}), _blocks(),
                   doc_id="HTA-2026-118", change_id="X")
    assert out.values["effective_date"] is None
    assert out.flags["effective_date"] == "not stated in the bulletin"
    assert out.needs_review


def test_hts_validator_hook():
    out = assemble(_with(), _blocks(), doc_id="HTA-2026-118", change_id="X",
                   hts_validator=lambda code: code != "848330")
    assert "848330" in out.flags["hts_scope"]


def test_countries_need_citation():
    out = assemble(_with(countries={"value": ["gb"], "block_ids": []}), _blocks(),
                   doc_id="HTA-2026-118", change_id="X")
    assert out.values["countries"] == ["GB"]
    assert "countries" in out.flags


def test_normalizes_codes_and_dates():
    out = assemble(_with(), _blocks(), doc_id="HTA-2026-118", change_id="CE-1")
    assert out.change.hts_scope == ["841391", "848130", "848180", "848330"]
    assert out.change.effective_date == date(2026, 12, 1)


def test_rejects_non_pdf_input(tmp_path):
    _, client = _client(tmp_path)
    [email_part, _] = route_file(EML, client=client)
    with pytest.raises(ValueError):
        extract_change(email_part, change_id="X", client=client)


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="live model check needs ANTHROPIC_API_KEY")
def test_live_extraction(tmp_path):
    client = LLMClient(cache_dir=tmp_path / "c", replay=False)
    out = extract_change(BULLETIN.read_bytes(), doc_id="HTA-2026-118", change_id="CE-0007", client=client)
    assert not out.flags, out.flags
    got = out.change.model_dump(mode="json")
    for name in ("hts_scope", "old_rate", "new_rate", "effective_date", "basis"):
        assert got[name] == FIXTURE[name], name
