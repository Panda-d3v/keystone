"""End to end across A1-A5 and the T14 rules, on the real demo files."""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import date
from pathlib import Path

from api.agents.a4_match import EntityMatcher, TrigramEmbedder
from api.agents.a5_actions import EvidenceGap
from api.agents.llm import LLMClient
from api.agents.pipeline import AgentPipeline, describe_change
from api.rules.evidence import check_uk_evidence
from contracts.models import ChangeEvent, DecisionCheck
from tests.agents.test_a2_change import FIXTURE as CHANGE_FIXTURE, GOOD as CHANGE_ANSWER
from tests.agents.test_a3_evidence import NINGBO_ANSWER, SHEFFIELD_ANSWER

ROOT = Path(__file__).resolve().parents[2]
DOCS = Path(__file__).parent / "fixtures" / "demo_docs"
DECISION = DecisionCheck.model_validate(json.loads((ROOT / "contracts/fixtures/decisions.json").read_text())[0])


def _csv(name):
    with zipfile.ZipFile(ROOT / "docs/reference/keystone-demo-pack.zip") as z:
        path = next(n for n in z.namelist() if n.endswith(f"/data/{name}"))
        return list(csv.DictReader(io.TextIOWrapper(z.open(path), encoding="utf-8")))


class DemoModel:
    """Answers each agent's request the way a correct model would."""

    ANSWERS = {
        "IntakeClassification": {"kind": "supplier_document", "confidence": 0.92, "reason": "inspection certificate header"},
        "ChangeDraft": CHANGE_ANSWER,
        "TextEvidenceDraft": NINGBO_ANSWER,
        "VisionEvidenceDraft": SHEFFIELD_ANSWER,
    }

    def __init__(self):
        self.calls: list[str] = []

    def generate(self, request):
        name = request.schema.__name__
        self.calls.append(name)
        return json.loads(json.dumps(self.ANSWERS[name]))


def _pipeline(tmp_path, model=None):
    model = model or DemoModel()
    client = LLMClient(model, cache_dir=tmp_path / "cache", replay=False)
    matcher = EntityMatcher.from_rows(_csv("parts.csv"), _csv("suppliers.csv"),
                                      embedder=TrigramEmbedder(), client=client)
    return model, AgentPipeline(matcher, client=client)


def test_bulletin_email_to_cited_change(tmp_path):
    _, p = _pipeline(tmp_path)
    email, bulletin = p.ingest((DOCS / "01_bulletin_email_HTA-2026-118.eml").read_bytes(),
                               "01_bulletin_email_HTA-2026-118.eml")
    assert email.summary == "Email with 1 attachment: HTA-2026-118."
    assert bulletin.change is not None and not bulletin.needs_review
    got = bulletin.change.model_dump(mode="json")
    for f in ("hts_scope", "old_rate", "new_rate", "effective_date", "basis"):
        assert got[f] == CHANGE_FIXTURE[f]
    assert bulletin.change.id == "CE-0007"
    assert bulletin.summary == (
        "Tariff bulletin HTA-2026-118: 4 HTS headings (8413.91, 8481.30, 8481.80, 8483.30) "
        "move from 25% to 50% on the full customs value, starting December 1, 2026.")


def test_ningbo_cert_is_clean(tmp_path):
    _, p = _pipeline(tmp_path)
    [cert] = p.ingest((DOCS / "02_mill_cert_Ningbo_MF-8413-005.pdf").read_bytes(),
                      "02_mill_cert_Ningbo_MF-8413-005.pdf")
    assert not cert.needs_review, cert.review
    assert {i.supplier_id for i in cert.evidence} == {"S001"}
    assert cert.supplier_match.match.method == "normalized"
    assert cert.summary == ("Mill certificate from Ningbo Haitai Precision Casting Co. (S001) for part "
                            "MF-8413-005, heats H26-3318 and H26-3322. Country of origin: China. "
                            "Melted and poured in Ningbo, China.")


def test_sheffield_scan_to_request_email(tmp_path):
    """Scan -> A1 -> A3 + A4 -> T14 rules -> A5 email, the demo's step 4 to 5."""
    _, p = _pipeline(tmp_path)
    [scan] = p.ingest((DOCS / "03_scan_mill_cert_Sheffield_MF-8413-005.jpg").read_bytes(),
                      "03_scan_mill_cert_Sheffield_MF-8413-005.jpg")
    assert {i.supplier_id for i in scan.evidence} == {"S007"}
    assert {i.batch_id for i in scan.evidence} == {"SF-24117", "SF-24121"}
    assert scan.review == [
        "Where the iron was melted and poured is unreadable (42% confidence, 85% needed). "
        "It will not be used until a clear copy arrives."]
    assert "unreadable (42% confidence)" in scan.summary

    heats = {"SF-24117", "SF-24121"}
    passport = check_uk_evidence("S007", "MF-8413-005", heats, scan.evidence, date(2026, 12, 1))
    assert [r.status for r in passport.requirements] == ["checked", "checked", "checked", "needs_review", "missing"]

    [action] = p.draft_next_actions([DECISION], [EvidenceGap(
        status=passport, supplier_name=p.matcher.label("S007"),
        part_description=p.matcher.label("MF-8413-005"), batch_ids=sorted(heats), decision=DECISION)])
    email = action.action.draft_email
    assert action.action.usd_at_stake == 49690 and action.action.rank == 1
    for fact in ("MF-8413-005", "SF-24117", "SF-24121", "Melt-and-pour certificate", "Origin declaration"):
        assert fact in email
    assert email.startswith("Hello Sheffield Forge & Pattern Ltd team,")


def test_replay_runs_the_whole_demo_offline(tmp_path):
    model, p = _pipeline(tmp_path)
    files = ["01_bulletin_email_HTA-2026-118.eml", "02_mill_cert_Ningbo_MF-8413-005.pdf",
             "03_scan_mill_cert_Sheffield_MF-8413-005.jpg"]
    first = [o.summary for f in files for o in p.ingest((DOCS / f).read_bytes(), f)]
    recorded = len(model.calls)

    replay = LLMClient(None, cache_dir=tmp_path / "cache", replay=True)  # no backend at all
    offline = AgentPipeline(p.matcher, client=replay)
    second = [o.summary for f in files for o in offline.ingest((DOCS / f).read_bytes(), f)]
    assert second == first and replay.stats.model_calls == 0 and recorded == 6  # scan is read three times


def test_unreadable_attachment_does_not_sink_upload(tmp_path):
    class Broken(DemoModel):
        def generate(self, request):
            if request.schema.__name__ == "ChangeDraft":
                raise RuntimeError("model down")
            return super().generate(request)

    _, p = _pipeline(tmp_path, Broken())
    email, bulletin = p.ingest((DOCS / "01_bulletin_email_HTA-2026-118.eml").read_bytes(), "x.eml")
    assert bulletin.change is None and bulletin.needs_review
    assert bulletin.review[0].startswith("Reading failed")


def test_unknown_file_asks_a_person(tmp_path):
    _, p = _pipeline(tmp_path)
    [o] = p.ingest(b"col_a,col_b\n1,2\n", "export.csv")
    assert o.needs_review and "not recognized" in o.summary


def test_describe_change_single_country():
    c = ChangeEvent(id="CE-1", measure="m", hts_scope=["730791"], countries=["CN"], old_rate=0.25,
                    new_rate=0.5, basis="full_customs_value", effective_date=date(2027, 1, 15), citations=[])
    assert describe_change(c, "X") == ("Tariff bulletin X: 1 HTS heading (7307.91) moves from 25% to 50% "
                                       "on the full customs value for goods from CN, starting January 15, 2027.")
