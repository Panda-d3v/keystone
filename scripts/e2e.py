"""Run Keystone's demo acceptance flow against a seeded, freshly reset API."""

import argparse
from pathlib import Path
from zipfile import ZipFile

import httpx

from api.audit.log import event_hash
from contracts.models import AuditEvent


def require(condition: bool, detail: str) -> None:
    if not condition:
        raise RuntimeError(detail)


def run(api_url: str, demo_pack: Path) -> None:
    with httpx.Client(base_url=api_url, timeout=90) as client, ZipFile(demo_pack) as archive:
        def get(path):
            return client.get(path).raise_for_status().json()

        def upload(name, content_type):
            return client.post(
                "/intake",
                files={"file": (name, archive.read(f"keystone_demo/docs/{name}"), content_type)},
            ).raise_for_status().json()

        bulletin = upload("01_bulletin_email_HTA-2026-118.eml", "message/rfc822")
        require("CE-0007" in bulletin["change_ids"], f"Bulletin did not produce CE-0007: {bulletin}")
        exposure = get("/changes/CE-0007/exposure")
        require(
            (exposure["affected_parts"], exposure["open_po_lines"],
             exposure["added_duty_usd"], exposure["annualized_added_duty_usd"])
            == (33, 33, 470687, 617061),
            "Exposure totals differ from the demo data",
        )
        decision = next(
            (item for item in get("/decisions") if item["decision_id"] == "D-2026-031"), None,
        )
        require(decision is not None and decision["status"] == "broken", "Casing award was not marked broken")

        upload("03_scan_mill_cert_Sheffield_MF-8413-005.jpg", "image/jpeg")
        evidence = get("/evidence/S007/MF-8413-005")
        melt = next((row for row in evidence["requirements"] if row["id"] == "EV-UK-01"), None)
        require(
            melt is not None and melt["status"] == "needs_review" and bool(melt["citations"]),
            "Expected a cited refusal for the Sheffield melt location",
        )

        actions = get("/actions")
        require(bool(actions), "No evidence request was drafted")
        action = actions[0]
        sent = client.post(
            f"/actions/{action['id']}/send", json={"draft_email": action["draft_email"]},
        ).raise_for_status().json()
        require(sent["decision_id"] == "D-2026-044", "Unexpected draft decision ID")
        require(
            sent["state"] == "pending_approval" and len(sent["pending_approvals"]) == 2,
            "Expected two pending approvals",
        )

        audit = [AuditEvent.model_validate(event) for event in get("/audit")]
        require(bool(audit) and audit[0].id == sent["audit_event"]["id"], "Missing send audit event")
        previous_hash = None
        for event in reversed(audit):
            require(
                event.previous_hash == previous_hash and event.hash == event_hash(event),
                f"Audit chain verification failed at {event.id}",
            )
            previous_hash = event.hash


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:8000")
    parser.add_argument("--demo-pack", type=Path, default=Path("docs/reference/keystone-demo-pack.zip"))
    arguments = parser.parse_args()
    run(arguments.api_url, arguments.demo_pack)
    print("Keystone demo acceptance passed.")
