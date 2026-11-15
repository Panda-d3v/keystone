"""T41: the committed replay cache runs the whole agent demo with no network."""

from scripts.record_replay import main


def test_committed_cache_replays_demo_offline(monkeypatch, capsys):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("KEYSTONE_LLM_CACHE", raising=False)
    assert main(["--check"]) == 0
    out = capsys.readouterr().out
    assert "0 model calls" in out
    assert "UK melt and pour: needs_review" in out
    assert "Ask Sheffield Forge & Pattern Ltd for the melt-and-pour certificate and origin declaration" in out
