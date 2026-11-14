"""T21 done-when: the 4 demo files classify to the expected types."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from api.agents import a1_intake
from api.agents.a1_intake import (
    IntakeClassification,
    classify_text,
    make_doc_id,
    route_bytes,
    route_file,
)
from api.agents.llm import LLMClient, LLMRequest
from contracts.models import DocEnvelope

DOCS = Path(__file__).parent / "fixtures" / "demo_docs"
EML = DOCS / "01_bulletin_email_HTA-2026-118.eml"
NINGBO = DOCS / "02_mill_cert_Ningbo_MF-8413-005.pdf"
SHEFFIELD = DOCS / "03_scan_mill_cert_Sheffield_MF-8413-005.jpg"
ADVISORY = DOCS / "HTA-2026-118_trade_advisory.pdf"


class VisionStub:
    """Stands in for the small vision model: reads only what the image shows."""

    def __init__(self, kind="supplier_document", confidence=0.9):
        self.calls: list[LLMRequest] = []
        self.kind, self.confidence = kind, confidence

    def generate(self, request: LLMRequest):
        self.calls.append(request)
        return {"kind": self.kind, "confidence": self.confidence, "reason": "header reads INSPECTION CERTIFICATE"}


class NoBackend:
    def generate(self, request):
        raise RuntimeError("no network")


@pytest.fixture
def stub(tmp_path):
    backend = VisionStub()
    return backend, LLMClient(backend, cache_dir=tmp_path / "cache", replay=False)


# --- done-when ---------------------------------------------------------------


def test_demo_pack_classifies_to_expected_types(stub):
    backend, client = stub
    got: dict[str, DocEnvelope] = {}
    for f in (EML, NINGBO, SHEFFIELD, ADVISORY):
        for r in route_file(f, client=client):
            got[r.envelope.filename] = r.envelope
            DocEnvelope.model_validate(r.envelope.model_dump())  # contract shape

    assert got["01_bulletin_email_HTA-2026-118.eml"].kind == "bulletin"
    assert got["HTA-2026-118_trade_advisory.pdf"].kind == "bulletin"
    assert got["02_mill_cert_Ningbo_MF-8413-005.pdf"].kind == "supplier_document"
    assert got["03_scan_mill_cert_Sheffield_MF-8413-005.jpg"].kind == "supplier_document"
    # Only the scan needs the model; text-layer docs are classified by rules.
    assert len(backend.calls) == 1
    assert backend.calls[0].attachments[0].media_type == "image/jpeg"
    assert backend.calls[0].model == client.models["small"]


def test_eml_unpacks_attachment(stub):
    _, client = stub
    results = route_file(EML, client=client)
    assert [r.envelope.media_type for r in results] == ["message/rfc822", "application/pdf"]
    email_env, pdf = results
    assert email_env.envelope.attachment_ids == ["HTA-2026-118"]
    assert pdf.envelope.doc_id == "HTA-2026-118"  # matches contracts/fixtures/changes.json citations
    assert pdf.parent_id == email_env.envelope.doc_id
    assert pdf.content.startswith(b"%PDF")
    assert pdf.envelope.sha256 == a1_intake.sha256_bytes(pdf.content)
    assert all(r.method == "rules" and not r.needs_review for r in results)


def test_second_run_makes_zero_model_calls(tmp_path):
    backend = VisionStub()
    route_file(SHEFFIELD, client=LLMClient(backend, cache_dir=tmp_path / "c", replay=False))
    second = LLMClient(backend, cache_dir=tmp_path / "c", replay=False)
    [r] = route_file(SHEFFIELD, client=second)
    assert r.envelope.kind == "supplier_document" and r.method == "llm"
    assert second.stats.model_calls == 0


def test_offline_scan_falls_back_to_filename_and_needs_review(tmp_path):
    client = LLMClient(NoBackend(), cache_dir=tmp_path / "c", replay=False)
    [r] = route_file(SHEFFIELD, client=client)
    assert r.envelope.kind == "supplier_document"
    assert r.method == "filename"
    assert r.needs_review


def test_replay_miss_degrades_instead_of_crashing(tmp_path):
    client = LLMClient(None, cache_dir=tmp_path / "c", replay=True)
    [r] = route_file(SHEFFIELD, client=client)
    assert r.method == "filename" and r.needs_review


def test_low_confidence_llm_goes_to_unknown(tmp_path):
    client = LLMClient(VisionStub(confidence=0.4), cache_dir=tmp_path / "c", replay=False)
    [r] = route_bytes(SHEFFIELD.read_bytes(), "scan_0001.jpg", client=client)
    assert r.envelope.kind == "unknown"
    assert r.needs_review


def test_unreadable_file_is_unknown(tmp_path):
    client = LLMClient(NoBackend(), cache_dir=tmp_path / "c", replay=False)
    [r] = route_bytes(b"\x00\x01binary", "blob.bin", client=client)
    assert r.envelope.kind == "unknown" and r.method == "none" and r.needs_review


def test_mill_cert_text_is_not_mistaken_for_bulletin():
    # The Ningbo cert mentions HS code and country of origin, which a naive
    # keyword match would read as a trade notice.
    text = a1_intake.extract_text(NINGBO.read_bytes(), "application/pdf")
    assert "HS code" in text
    assert classify_text(text)[0] == "supplier_document"


def test_short_or_empty_text_is_inconclusive():
    assert classify_text("") is None
    assert classify_text("tariff") is None


def test_doc_id_rules():
    assert make_doc_id("HTA-2026-118_trade_advisory.pdf") == "HTA-2026-118"
    assert make_doc_id("03_scan_mill_cert_Sheffield_MF-8413-005.jpg") == "03_scan_mill_cert_Sheffield_MF-8413-005"


def test_csv_with_no_signal_is_unknown(tmp_path):
    client = LLMClient(NoBackend(), cache_dir=tmp_path / "c", replay=False)
    [r] = route_bytes(b"po_no,line,supplier_id,part_no,qty\nPO-1,1,S001,MF-1,5\n", "export.csv", client=client)
    assert r.envelope.media_type == "text/csv"
    assert r.envelope.kind == "unknown"


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="live model check needs ANTHROPIC_API_KEY")
def test_live_scan_classification(tmp_path):
    client = LLMClient(cache_dir=tmp_path / "c", replay=False)
    [r] = route_file(SHEFFIELD, client=client)
    assert r.method == "llm"
    assert r.envelope.kind == "supplier_document"
    assert IntakeClassification  # schema importable for the recorder
