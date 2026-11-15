"""T41 - Record and check the offline replay cache for the demo.

Record (needs ANTHROPIC_API_KEY, run once before the demo):

    python -m scripts.record_replay

Check that the demo will run with Wi-Fi off (no key, no network):

    python -m scripts.record_replay --check

Both run every demo document through the real agent pipeline (A1-A4) and
the A5 action drafter, and print what a business user would see. Recording
writes the model outputs to api/agents/cache/<file sha256>/<task>.json,
which is committed and copied into the API image. --check runs the same
steps with REPLAY=1 and exits 1 if any step would need the network.

Only model outputs are cached. No key, prompt secret or customer data is
written; the cache holds what the agents extracted from the demo files.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import zipfile
from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.agents.a4_match import EntityMatcher, TrigramEmbedder  # noqa: E402
from api.agents.a5_actions import EvidenceGap  # noqa: E402
from api.agents.llm import DEFAULT_CACHE_DIR, CacheMiss, LLMClient  # noqa: E402
from api.agents.pipeline import AgentPipeline  # noqa: E402
from api.rules.evidence import check_uk_evidence  # noqa: E402
from contracts.models import DecisionCheck  # noqa: E402

DEMO_DOCS = ROOT / "tests" / "agents" / "fixtures" / "demo_docs"
DEMO_PACK = ROOT / "docs" / "reference" / "keystone-demo-pack.zip"
DEMO_FILES = (
    "01_bulletin_email_HTA-2026-118.eml",
    "02_mill_cert_Ningbo_MF-8413-005.pdf",
    "03_scan_mill_cert_Sheffield_MF-8413-005.jpg",
)
SHEFFIELD = ("S007", "MF-8413-005", ("SF-24117", "SF-24121"))


@dataclass
class Report:
    ok: bool
    model_calls: int
    cache_hits: int
    lines: list[str]


def demo_matcher(client: LLMClient) -> EntityMatcher:
    def rows(name: str) -> list[dict]:
        with zipfile.ZipFile(DEMO_PACK) as z:
            path = next(n for n in z.namelist() if n.endswith(f"/data/{name}"))
            return list(csv.DictReader(io.TextIOWrapper(z.open(path), encoding="utf-8")))

    return EntityMatcher.from_rows(rows("parts.csv"), rows("suppliers.csv"),
                                   embedder=TrigramEmbedder(), client=client)


def run(client: LLMClient, *, polish: bool = False) -> Report:
    pipeline = AgentPipeline(demo_matcher(client), client=client)
    lines: list[str] = []
    ok = True
    evidence = []
    try:
        for name in DEMO_FILES:
            for doc in pipeline.ingest((DEMO_DOCS / name).read_bytes(), name):
                lines.append(f"[{doc.doc_id}] {doc.summary}")
                lines += [f"    needs a person: {r}" for r in doc.review]
                if any(r.startswith("Reading failed") for r in doc.review):
                    ok = False
                evidence += doc.evidence

        supplier, part, heats = SHEFFIELD
        passport = check_uk_evidence(supplier, part, set(heats), evidence, date(2026, 12, 1))
        decision = DecisionCheck.model_validate(
            json.loads((ROOT / "contracts" / "fixtures" / "decisions.json").read_text())[0])
        drafts = pipeline.draft_next_actions([decision], [EvidenceGap(
            status=passport, supplier_name=pipeline.matcher.label(supplier),
            part_description=pipeline.matcher.label(part), batch_ids=list(heats), decision=decision,
        )], polish=polish)
        lines.append(f"Evidence passport {supplier}/{part}: {passport.status} "
                     f"({', '.join(f'{r.label}: {r.status}' for r in passport.requirements)})")
        for d in drafts:
            lines.append(f"Action {d.action.id} (${d.action.usd_at_stake:,.0f}/yr): {d.title}")
            lines.append(f"    {d.why}")
        if not drafts or passport.requirements[3].status != "needs_review":
            ok = False
            lines.append("UNEXPECTED: the Sheffield refusal or the evidence request is missing.")
    except CacheMiss as exc:
        ok = False
        lines.append(f"CACHE MISS: {exc}")
    return Report(ok, client.stats.model_calls, client.stats.cache_hits, lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="replay only; fail if anything needs the network")
    ap.add_argument("--refresh", action="store_true", help="re-record even if cached")
    ap.add_argument("--polish", action="store_true", help="also record the A5 email polish")
    ap.add_argument("--cache-dir", type=Path, default=Path(os.environ.get("KEYSTONE_LLM_CACHE", DEFAULT_CACHE_DIR)))
    args = ap.parse_args(argv)

    if args.check:
        client = LLMClient(None, cache_dir=args.cache_dir, replay=True)
    else:
        if not os.environ.get("ANTHROPIC_API_KEY"):
            print("Set ANTHROPIC_API_KEY to record (or use --check to verify the cache).", file=sys.stderr)
            return 2
        if args.refresh:
            _clear(args.cache_dir)
        client = LLMClient(cache_dir=args.cache_dir, replay=False)

    report = run(client, polish=args.polish)
    print("\n".join(report.lines))
    mode = "check (offline replay)" if args.check else "record"
    print(f"\n{mode}: {'OK' if report.ok else 'FAILED'} - "
          f"{report.model_calls} model calls, {report.cache_hits} cached answers, cache at {args.cache_dir}")
    if args.check and report.model_calls:
        return 1
    return 0 if report.ok else 1


def _clear(cache_dir: Path) -> None:
    for p in cache_dir.glob("*/*.json"):
        p.unlink()


if __name__ == "__main__":
    raise SystemExit(main())
