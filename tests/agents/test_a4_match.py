"""T24 done-when: "MF8413005" and "mf-8413-005" match part MF-8413-005."""

from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path

import pytest

from api.agents.a4_match import EntityMatcher, MIN_SCORE, TrigramEmbedder, normalize
from api.agents.llm import LLMClient, LLMRequest
from contracts.models import Match

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "docs" / "reference" / "keystone-demo-pack.zip"


def _csv(name: str) -> list[dict]:
    with zipfile.ZipFile(PACK) as z:
        path = next(n for n in z.namelist() if n.endswith(f"/data/{name}"))
        return list(csv.DictReader(io.TextIOWrapper(z.open(path), encoding="utf-8")))


class NoModel:
    def generate(self, request):
        raise RuntimeError("offline")


class Picker:
    def __init__(self, pick):
        self.pick, self.calls = pick, []

    def generate(self, request: LLMRequest):
        self.calls.append(request)
        return {"entity_id": self.pick, "reason": "same size"}


def _matcher(tmp_path, backend=None) -> EntityMatcher:
    client = LLMClient(backend or NoModel(), cache_dir=tmp_path / "cache", replay=False)
    return EntityMatcher.from_rows(_csv("parts.csv"), _csv("suppliers.csv"),
                                   embedder=TrigramEmbedder(), client=client)


# --- done-when ---------------------------------------------------------------


@pytest.mark.parametrize("text", ["MF8413005", "mf-8413-005", "MF-8413-005", " mf 8413 005 "])
def test_part_number_variants_match(tmp_path, text):
    r = _matcher(tmp_path).match_part(text)
    assert r.match is not None and r.match.entity_id == "MF-8413-005"
    assert r.match.score >= MIN_SCORE
    Match.model_validate(r.match.model_dump())


def test_exact_vs_normalized_method(tmp_path):
    m = _matcher(tmp_path)
    assert m.match_part("MF-8413-005").match.method == "exact"
    assert m.match_part("MF8413005").match.method == "normalized"


# --- suppliers: printed names on certificates ---------------------------------


@pytest.mark.parametrize("printed,expected", [
    ("Ningbo Haitai Precision Casting Co., Ltd. (fictional)", "S001"),
    ("Sheffield Forge & Pattern Ltd (fictional)", "S007"),
    ("SHEFFIELD FORGE AND PATTERN LIMITED", "S007"),
    ("S007", "S007"),
])
def test_supplier_names_from_certificates(tmp_path, printed, expected):
    r = _matcher(tmp_path).match_supplier(printed)
    assert r.match is not None and r.match.entity_id == expected


def test_resolver_plugs_into_a3(tmp_path):
    resolve = _matcher(tmp_path).resolver("supplier")
    assert resolve("Ningbo Haitai Precision Casting Co., Ltd. (fictional)") == "S001"
    assert resolve("Acme Widgets Ltd") is None  # unknown suppliers are never guessed


# --- safety: below 0.8 or a near-tie never auto-links ----------------------


def test_unknown_part_goes_to_review(tmp_path):
    r = _matcher(tmp_path).match_part("Hydraulic gearbox housing, aluminium")
    assert r.match is None and r.needs_review
    assert "Please" in r.explain()  # plain-language next step


def test_description_near_tie_needs_a_person_offline(tmp_path):
    # Five pump casings differ only by size; similarity alone can't choose.
    r = _matcher(tmp_path).match_part("Pump casing, ductile iron, ANSI B73.1")
    assert r.match is None
    assert len(r.candidates) >= 2


def test_llm_tie_break_can_only_pick_a_candidate(tmp_path):
    picker = Picker("MF-8413-005")
    m = _matcher(tmp_path, picker)
    r = m.match_part("Pump casing, ductile iron, ANSI B73.1, size 3x2-10 (cert)")
    if picker.calls:  # tie-break ran
        assert r.match.method == "llm" and r.match.entity_id == "MF-8413-005"
        assert "MF-8413-005" in picker.calls[0].prompt
    else:  # clear winner without the model
        assert r.match.entity_id == "MF-8413-005"


def test_llm_tie_break_cannot_invent(tmp_path):
    m = _matcher(tmp_path, Picker("MF-9999-999"))
    r = m.match_part("Pump casing, ductile iron, ANSI B73.1")
    assert r.match is None


def test_explain_is_plain_language(tmp_path):
    m = _matcher(tmp_path)
    text = m.match_part("mf-8413-005").explain(m)
    assert text.startswith('"mf-8413-005" is part MF-8413-005')
    assert "Pump casing" in text and "written differently" in text


def test_normalize_supplier_strips_legal_suffixes():
    assert normalize("Sheffield Forge & Pattern Ltd (fictional)", "supplier") == \
        normalize("Sheffield Forge and Pattern Limited", "supplier")


def test_explain_near_tie_asks_to_pick(tmp_path):
    m = _matcher(tmp_path)
    text = m.match_part("Pump casing, ductile iron, ANSI B73.1").explain(m)
    assert text.startswith("Several parts look like") and "Please pick" in text


def test_explain_no_plausible_match(tmp_path):
    m = _matcher(tmp_path)
    assert m.match_part("Hydraulic gearbox housing, aluminium").explain(m).startswith("No part on file")


def test_explain_supplier_name(tmp_path):
    m = _matcher(tmp_path)
    assert "same name written differently" in m.match_supplier("Taizhou Jinhong Pump Parts").explain(m)
