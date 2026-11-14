"""T20 done-when: the second run of any doc makes 0 model calls."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from api.agents.llm import (
    AnthropicBackend,
    Attachment,
    CacheMiss,
    LLMClient,
    LLMOutputError,
    LLMRefusal,
    LLMRequest,
    sha256_bytes,
    sha256_file,
)

DEMO_DOCS = Path(__file__).resolve().parent / "fixtures" / "demo_docs"


class Classified(BaseModel):
    type: str
    confidence: float


class FakeBackend:
    def __init__(self, output=None):
        self.calls: list[LLMRequest] = []
        self.output = output or {"type": "regulatory_bulletin", "confidence": 0.97}

    def generate(self, request: LLMRequest):
        self.calls.append(request)
        return dict(self.output)


def _client(tmp_path, backend=None, **kw):
    return LLMClient(backend or FakeBackend(), cache_dir=tmp_path / "cache", replay=kw.pop("replay", False), **kw)


def _extract(client, data=b"%PDF-1.7 bulletin", task="a1_intake", prompt="classify"):
    att = Attachment(data=data, media_type="application/pdf", name="b.pdf")
    return client.extract(
        Classified, task=task, prompt=prompt, file_sha256=att.sha256, attachments=[att], tier="small"
    )


def test_second_run_of_same_doc_makes_zero_model_calls(tmp_path):
    backend = FakeBackend()
    first = _client(tmp_path, backend)
    r1 = _extract(first)
    assert first.stats.model_calls == 1

    # Fresh client, same cache dir: simulates a second process run.
    second = _client(tmp_path, backend)
    r2 = _extract(second)
    assert second.stats.model_calls == 0
    assert second.stats.cache_hits == 1
    assert len(backend.calls) == 1
    assert r1 == r2


def test_cache_is_keyed_by_file_sha256_and_task(tmp_path):
    backend = FakeBackend()
    c = _client(tmp_path, backend)
    _extract(c, data=b"doc-a")
    _extract(c, data=b"doc-b")
    _extract(c, data=b"doc-a", task="a2_change")
    _extract(c, data=b"doc-a")  # hit
    assert c.stats.model_calls == 3
    sha = sha256_bytes(b"doc-a")
    assert (tmp_path / "cache" / sha / "a1_intake.json").exists()
    assert (tmp_path / "cache" / sha / "a2_change.json").exists()


def test_changed_prompt_refreshes_in_live_mode(tmp_path):
    c = _client(tmp_path)
    _extract(c, prompt="v1")
    _extract(c, prompt="v2")
    assert c.stats.model_calls == 2


def test_replay_serves_cache_without_backend(tmp_path):
    _extract(_client(tmp_path))
    replay = LLMClient(None, cache_dir=tmp_path / "cache", replay=True)
    out = _extract(replay, prompt="edited prompt still replays")
    assert out.type == "regulatory_bulletin"
    assert replay.stats.model_calls == 0


def test_replay_cache_miss_fails_loudly(tmp_path):
    replay = LLMClient(FakeBackend(), cache_dir=tmp_path / "cache", replay=True)
    with pytest.raises(CacheMiss, match="REPLAY=1"):
        _extract(replay)


def test_replay_env_var(tmp_path, monkeypatch):
    monkeypatch.setenv("REPLAY", "1")
    c = LLMClient(FakeBackend(), cache_dir=tmp_path / "cache")
    assert c.replay is True
    with pytest.raises(CacheMiss):
        _extract(c)


def test_invalid_model_output_raises_and_is_not_cached(tmp_path):
    c = _client(tmp_path, FakeBackend(output={"type": "x"}))
    with pytest.raises(LLMOutputError):
        _extract(c)
    assert not list((tmp_path / "cache").glob("*/*.json"))


def test_cache_key_must_be_sha256(tmp_path):
    c = _client(tmp_path)
    with pytest.raises(ValueError):
        c.extract(Classified, task="t", prompt="p", file_sha256="not-a-hash")


def test_tier_selects_model(tmp_path):
    backend = FakeBackend()
    c = _client(tmp_path, backend, models={"small": "small-model", "large": "large-model"})
    _extract(c)
    assert backend.calls[0].model == "small-model"


def test_request_puts_attachments_before_prompt():
    req = LLMRequest(
        model="m",
        system="s",
        prompt="read this",
        schema=Classified,
        attachments=(
            Attachment(b"%PDF", "application/pdf"),
            Attachment(b"\x89PNG", "image/png"),
        ),
    )
    content = req.messages()[0]["content"]
    assert [b["type"] for b in content] == ["document", "image", "text"]
    assert content[0]["source"]["media_type"] == "application/pdf"
    assert "\n" not in content[0]["source"]["data"]


@pytest.mark.skipif(not DEMO_DOCS.exists(), reason="demo pack not present")
def test_attachment_from_demo_files():
    pdf = Attachment.from_path(DEMO_DOCS / "02_mill_cert_Ningbo_MF-8413-005.pdf")
    jpg = Attachment.from_path(DEMO_DOCS / "03_scan_mill_cert_Sheffield_MF-8413-005.jpg")
    assert pdf.media_type == "application/pdf"
    assert jpg.media_type == "image/jpeg"
    assert pdf.sha256 == sha256_file(DEMO_DOCS / "02_mill_cert_Ningbo_MF-8413-005.pdf")


# --- AnthropicBackend with a stubbed SDK client (no network) ---------------


class _StubMessages:
    def __init__(self, response):
        self.response = response
        self.kwargs = None

    def parse(self, **kwargs):
        self.kwargs = kwargs
        return self.response


def _stub_client(response):
    msgs = _StubMessages(response)
    return SimpleNamespace(beta=SimpleNamespace(messages=msgs), messages=msgs), msgs


def _req():
    return LLMRequest(model="claude-opus-5-5", system="sys", prompt="p", schema=Classified)


def test_anthropic_backend_uses_structured_output_and_fallbacks():
    parsed = Classified(type="supplier_cert", confidence=0.9)
    client, msgs = _stub_client(SimpleNamespace(stop_reason="end_turn", parsed_output=parsed))
    out = AnthropicBackend(client).generate(_req())
    assert out == {"type": "supplier_cert", "confidence": 0.9}
    assert msgs.kwargs["output_format"] is Classified
    assert msgs.kwargs["fallbacks"] == "default"
    assert AnthropicBackend.FALLBACK_BETA in msgs.kwargs["betas"]


def test_anthropic_backend_refusal():
    client, _ = _stub_client(SimpleNamespace(stop_reason="refusal", stop_details={"category": "x"}, parsed_output=None))
    with pytest.raises(LLMRefusal):
        AnthropicBackend(client).generate(_req())


def test_anthropic_backend_truncation():
    client, _ = _stub_client(SimpleNamespace(stop_reason="max_tokens", parsed_output=None))
    with pytest.raises(LLMOutputError):
        AnthropicBackend(client).generate(_req())


def test_cache_entry_is_readable_json(tmp_path):
    c = _client(tmp_path)
    _extract(c)
    entry = json.loads(next((tmp_path / "cache").glob("*/*.json")).read_text())
    assert entry["schema"] == "Classified"
    assert entry["output"]["type"] == "regulatory_bulletin"
