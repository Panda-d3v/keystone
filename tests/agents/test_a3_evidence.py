"""T23 done-when: Ningbo cert fields all >= 0.85; Sheffield melt location < 0.85."""

from __future__ import annotations

import json
import os
from datetime import date
from pathlib import Path

import pytest

from api.agents.a1_intake import route_file
from api.agents.a3_evidence import (
    MIN_CONFIDENCE,
    TEXT_LAYER_CONFIDENCE,
    extract_evidence,
)
from api.agents.llm import LLMClient, LLMRequest
from api.rules.evidence import check_uk_evidence
from contracts.models import EvidenceItem

DOCS = Path(__file__).parent / "fixtures" / "demo_docs"
NINGBO = DOCS / "02_mill_cert_Ningbo_MF-8413-005.pdf"
SHEFFIELD = DOCS / "03_scan_mill_cert_Sheffield_MF-8413-005.jpg"
SUPPLIERS = {"ningbo haitai": "S001", "sheffield forge": "S007"}


def resolve(name: str) -> str | None:
    low = name.lower()
    return next((sid for key, sid in SUPPLIERS.items() if low.startswith(key)), None)


def f(value, *ids):
    return {"value": value, "block_ids": list(ids)}


# Block ids from PyMuPDF on the Ningbo cert: 3 supplier, 6 cert no, 7 issue
# date, 9 PO, 10 part, 12 material, 13 HS code, 14 origin, 15 melt, 17 heats.
NINGBO_ANSWER = {
    "doc_kind": "mill_certificate",
    "supplier_name": f("Ningbo Haitai Precision Casting Co., Ltd. (fictional)", 3),
    "certificate_no": f("NHPC-26-11427", 6),
    "issue_date": f("2026-10-28", 7),
    "expires_on": f(None),
    "customer_po": f("PO-4504", 9),
    "part_no": f("MF-8413-005", 10),
    "material_spec": f("ASTM A536 Grade 65-45-12", 12),
    "hs_code": f("8413.91.90", 13),
    "country_of_origin": f("China", 14),
    "melt_location": f("Ningbo, China", 15),
    "heats": [
        {"heat_no": "H26-3318", "qty": "120", "block_ids": [17]},
        {"heat_no": "H26-3322", "qty": "80", "block_ids": [17]},
    ],
}


def seen(value, confidence, bbox):
    return {"value": value, "confidence": confidence, "bbox": bbox, "page": 1}


# What the vision model reports for the degraded Sheffield scan: the header
# rows are legible, the melt location is under a smudge.
SHEFFIELD_ANSWER = {
    "doc_kind": "mill_certificate",
    "supplier_name": seen("Sheffield Forge & Pattern Ltd (fictional)", 0.93, [0.1, 0.1, 0.5, 0.13]),
    "certificate_no": seen("SFP-3.1-07791", 0.88, [0.33, 0.15, 0.5, 0.17]),
    "issue_date": seen("2026-11-02", 0.9, [0.33, 0.17, 0.45, 0.19]),
    "expires_on": seen(None, 0.95, []),
    "customer_po": seen("Quote Q-2026-0412", 0.86, [0.33, 0.2, 0.52, 0.22]),
    "part_no": seen("MF-8413-005", 0.91, [0.33, 0.22, 0.47, 0.24]),
    "material_spec": seen("ASTM A536 Grade 65-45-12", 0.87, [0.33, 0.25, 0.58, 0.27]),
    "hs_code": seen("8413.91.90", 0.88, [0.33, 0.27, 0.45, 0.29]),
    "country_of_origin": seen("United Kingdom", 0.93, [0.33, 0.29, 0.5, 0.31]),
    "melt_location": seen(None, 0.42, [0.1, 0.28, 0.65, 0.31]),
    "heats": [
        {"heat_no": seen("SF 24117", 0.9, [0.1, 0.35, 0.2, 0.37]), "qty": seen("60", 0.9, [0.22, 0.35, 0.26, 0.37])},
        {"heat_no": seen("SF 24121", 0.9, [0.1, 0.37, 0.2, 0.39]), "qty": seen("60", 0.9, [0.22, 0.37, 0.26, 0.39])},
    ],
}


class Stub:
    def __init__(self, answers):
        self.answers = answers  # task -> answer
        self.calls: list[LLMRequest] = []

    def generate(self, request):
        self.calls.append(request)
        name = request.schema.__name__
        return json.loads(json.dumps(self.answers[name]))


def _client(tmp_path, **answers):
    stub = Stub({
        "TextEvidenceDraft": NINGBO_ANSWER,
        "VisionEvidenceDraft": SHEFFIELD_ANSWER,
        "IntakeClassification": {"kind": "supplier_document", "confidence": 0.9, "reason": "certificate"},
        **answers,
    })
    return stub, LLMClient(stub, cache_dir=tmp_path / "cache", replay=False)


def _doc(path, client):
    [r] = route_file(path, client=client)
    return r


# --- done-when ---------------------------------------------------------------


def test_ningbo_all_fields_at_or_above_threshold(tmp_path):
    stub, client = _client(tmp_path)
    out = extract_evidence(_doc(NINGBO, client), resolve_supplier=resolve, client=client)

    assert out.method == "text" and not out.flags
    assert out.field_confidence and min(out.field_confidence.values()) >= MIN_CONFIDENCE
    assert "expires_on" not in out.field_confidence
    assert [i.batch_id for i in out.items] == ["H26-3318", "H26-3322"]
    for item in out.items:
        EvidenceItem.model_validate(item.model_dump())
        assert item.supplier_id == "S001" and item.part_no == "MF-8413-005"
        assert item.kind == "mill_certificate" and item.confidence >= MIN_CONFIDENCE
        assert item.fields["melt_location"] == "Ningbo, China"
        assert item.fields["country_of_origin"] == "China"
        conf = {k: v for k, v in item.fields.items() if k.endswith("_confidence")}
        assert conf and all(v >= MIN_CONFIDENCE for v in conf.values())
        for name, cites in item.field_citations.items():
            assert cites and all(c.page == 1 and len(c.bbox) == 4 and c.quote for c in cites), name
    assert out.items[0].fields["heat_qty"] == "120"
    assert "expires_on" not in out.items[0].fields  # not printed, not invented
    assert stub.calls[0].schema.__name__ == "TextEvidenceDraft"


def test_sheffield_melt_location_below_threshold(tmp_path):
    stub, client = _client(tmp_path)
    out = extract_evidence(_doc(SHEFFIELD, client), resolve_supplier=resolve, client=client)

    assert out.method == "vision"
    assert out.field_confidence["melt_location"] < MIN_CONFIDENCE
    assert out.low_confidence_fields == ["melt_location"]
    assert [i.batch_id for i in out.items] == ["SF-24117", "SF-24121"]  # normalized like T14 expects
    for item in out.items:
        assert item.supplier_id == "S007"
        assert item.fields["melt_location"] is None
        assert item.fields["melt_location_confidence"] == 0.42
        assert item.field_citations["melt_location"][0].bbox == (0.1, 0.28, 0.65, 0.31)
        assert item.fields["country_of_origin"] == "United Kingdom"
    assert stub.calls[0].attachments[0].media_type == "image/jpeg"


def test_sheffield_feeds_t14_rules_to_needs_review(tmp_path):
    """A3 output plugs straight into api/rules/evidence.py (T14)."""
    _, client = _client(tmp_path)
    out = extract_evidence(_doc(SHEFFIELD, client), resolve_supplier=resolve, client=client)
    status = check_uk_evidence("S007", "MF-8413-005", {"SF-24117", "SF-24121"}, out.items, date(2026, 12, 1))

    rows = {r.id: r for r in status.requirements}
    assert status.status == "needs_review"
    assert rows["part-number"].status == "checked"
    assert rows["heat-batch"].status == "checked"
    assert rows["certificate-origin"].status == "checked"
    assert rows["EV-UK-01"].status == "needs_review"
    assert rows["EV-UK-01"].citations[0].bbox == (0.1, 0.28, 0.65, 0.31)
    assert rows["origin-declaration"].status == "missing"


def test_second_run_makes_zero_model_calls(tmp_path):
    stub, client = _client(tmp_path)
    extract_evidence(_doc(NINGBO, client), resolve_supplier=resolve, client=client)
    again = LLMClient(stub, cache_dir=tmp_path / "cache", replay=False)
    extract_evidence(_doc(NINGBO, again), resolve_supplier=resolve, client=again)
    assert again.stats.model_calls == 0


# --- trust checks ------------------------------------------------------------


def test_text_value_not_printed_is_dropped(tmp_path):
    bad = json.loads(json.dumps(NINGBO_ANSWER))
    bad["melt_location"] = f("Sheffield, United Kingdom", 15)  # hallucinated
    _, client = _client(tmp_path, TextEvidenceDraft=bad)
    out = extract_evidence(_doc(NINGBO, client), resolve_supplier=resolve, client=client)
    assert out.items[0].fields["melt_location"] is None
    assert out.field_confidence["melt_location"] == 0.0
    assert "not printed" in out.flags["melt_location"]


def test_text_value_with_bogus_block_is_dropped(tmp_path):
    bad = json.loads(json.dumps(NINGBO_ANSWER))
    bad["country_of_origin"] = f("China", 999)
    _, client = _client(tmp_path, TextEvidenceDraft=bad)
    out = extract_evidence(_doc(NINGBO, client), resolve_supplier=resolve, client=client)
    assert out.flags["country_of_origin"] == "no valid citation"


class TwoReads(Stub):
    """First vision call is the enhanced scan, second the original pixels."""

    def __init__(self, first, second, third=None):
        super().__init__({"TextEvidenceDraft": NINGBO_ANSWER,
                          "IntakeClassification": {"kind": "supplier_document", "confidence": 0.9, "reason": "c"}})
        self.reads = [first, second, third if third is not None else second]

    def generate(self, request):
        if request.schema.__name__ == "VisionEvidenceDraft":
            self.calls.append(request)
            return json.loads(json.dumps(self.reads.pop(0)))
        return super().generate(request)


def _two_reads(tmp_path, first, second, third=None):
    stub = TwoReads(first, second, third)
    client = LLMClient(stub, cache_dir=tmp_path / "cache", replay=False)
    return stub, extract_evidence(_doc(SHEFFIELD, client), resolve_supplier=resolve, client=client)


def _with_field(name, **changes):
    answer = json.loads(json.dumps(SHEFFIELD_ANSWER))
    answer[name] = {**answer[name], **changes}
    return answer


def test_scan_is_read_twice_and_agreement_confirms(tmp_path):
    # Live Claude reads legible-but-blurred fields right yet rates them ~0.6.
    calibrated = _with_field("part_no", confidence=0.6)
    stub, out = _two_reads(tmp_path, calibrated, calibrated)
    vision = [c for c in stub.calls if c.schema.__name__ == "VisionEvidenceDraft"]
    assert len(vision) == 3
    assert [v.attachments[0].media_type for v in vision] == ["image/png", "image/png", "image/jpeg"]
    assert out.items[0].part_no == "MF-8413-005"
    assert out.field_confidence["part_no"] == 0.9


def test_one_misread_is_outvoted(tmp_path):
    # Live run: the low-resolution original once read MF-8413-006.
    misread = _with_field("part_no", value="MF-8413-006")
    _, out = _two_reads(tmp_path, SHEFFIELD_ANSWER, SHEFFIELD_ANSWER, misread)
    assert out.items[0].part_no == "MF-8413-005"
    assert out.field_confidence["part_no"] == 0.86


def test_no_majority_is_not_trusted(tmp_path):
    _, out = _two_reads(tmp_path, SHEFFIELD_ANSWER, _with_field("part_no", value="MF-8418-005"),
                        _with_field("part_no", value="MF-8413-006"))
    assert out.items[0].part_no == ""
    assert out.field_confidence["part_no"] <= 0.5


def test_one_unclear_read_is_enough_to_refuse(tmp_path):
    guess = _with_field("melt_location", value="Sheffield, United Kingdom", confidence=0.9, status="read")
    unclear = _with_field("melt_location", value=None, confidence=0.05, status="unclear")
    _, out = _two_reads(tmp_path, guess, unclear)
    assert out.items[0].fields["melt_location"] is None
    assert out.items[0].fields["melt_location_confidence"] == 0.05


def test_agreeing_low_guesses_are_not_rescued(tmp_path):
    guess = _with_field("melt_location", value="Sheffield, United Kingdom", confidence=0.4, status="read")
    _, out = _two_reads(tmp_path, guess, guess)
    assert out.items[0].fields["melt_location"] is None
    assert "unreadable" in out.flags["melt_location"]


def test_not_present_field_is_omitted(tmp_path):
    absent = _with_field("expires_on", value=None, confidence=0.9, status="not_present", bbox=[0.3, 0.1, 0.6, 0.3])
    _, out = _two_reads(tmp_path, absent, absent)
    assert "expires_on" not in out.items[0].fields
    assert "expires_on" not in out.field_confidence


def test_vision_value_without_bbox_is_dropped(tmp_path):
    bad = json.loads(json.dumps(SHEFFIELD_ANSWER))
    bad["country_of_origin"] = seen("United Kingdom", 0.95, [0.9, 0.1, 0.2, 0.3])
    _, client = _client(tmp_path, VisionEvidenceDraft=bad)
    out = extract_evidence(_doc(SHEFFIELD, client), resolve_supplier=resolve, client=client)
    assert out.items[0].fields["country_of_origin"] is None
    assert out.flags["country_of_origin"] == "no valid bbox"


def test_unknown_supplier_is_flagged_not_matched(tmp_path):
    _, client = _client(tmp_path)
    out = extract_evidence(_doc(NINGBO, client), resolve_supplier=lambda n: None, client=client)
    assert all(i.supplier_id == "" for i in out.items)
    assert "supplier_id" in out.flags


def test_text_layer_confidence_constant():
    assert TEXT_LAYER_CONFIDENCE >= MIN_CONFIDENCE


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="live model check needs ANTHROPIC_API_KEY")
def test_live_sheffield_scan(tmp_path):
    client = LLMClient(cache_dir=tmp_path / "c", replay=False)
    out = extract_evidence(_doc(SHEFFIELD, client), resolve_supplier=resolve, client=client)
    assert out.field_confidence["melt_location"] < MIN_CONFIDENCE
    assert all(i.fields.get("melt_location") is None for i in out.items)


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="live model check needs ANTHROPIC_API_KEY")
def test_live_ningbo(tmp_path):
    client = LLMClient(cache_dir=tmp_path / "c", replay=False)
    out = extract_evidence(_doc(NINGBO, client), resolve_supplier=resolve, client=client)
    assert {i.batch_id for i in out.items} == {"H26-3318", "H26-3322"}
    assert out.items[0].fields["melt_location"] == "Ningbo, China"
