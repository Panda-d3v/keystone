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


def run(client: httpx.Client, demo_pack: Path, *, confirm_sheffield: bool = False) -> None:
    with ZipFile(demo_pack) as archive:
        def get(path):
            return client.get(path).raise_for_status().json()

        def upload(name, content_type, fields=None):
            return client.post(
                "/intake", data=fields,
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

        scan = "03_scan_mill_cert_Sheffield_MF-8413-005.jpg"
        result = upload(scan, "image/jpeg")
        if confirm_sheffield and not result["evidence_doc_ids"]:
            upload(scan, "image/jpeg", {"supplier_id": "S007", "part_no": "MF-8413-005"})
        evidence = get("/evidence/S007/MF-8413-005")
        melt = next((row for row in evidence["requirements"] if row["id"] == "EV-UK-01"), None)
        require(
            melt is not None and melt["status"] == "needs_review" and bool(melt["citations"]),
            "Expected a cited refusal for the Sheffield melt location",
        )

        source = client.get(f"/documents/{melt['citations'][0]['doc_id']}").raise_for_status()
        require(source.headers.get("content-type") == "image/jpeg", "Expected the cited scan bytes")

        actions = get("/actions")
        require(bool(actions), "No evidence request was drafted")
        action = actions[0]
        require("SF-24117" in action["draft_email"] and "SF-24121" in action["draft_email"],
                "Evidence request must name both heats")
        draft = action["draft_email"] + "\nPlease include the quote number in your reply."
        sent = client.post(
            f"/actions/{action['id']}/send", json={"draft_email": draft},
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
    parser.add_argument("--confirm-sheffield", action="store_true",
                        help="Confirm the demo quote if the scan cannot be linked automatically")
    arguments = parser.parse_args()
    with httpx.Client(base_url=arguments.api_url, timeout=90) as client:
        run(client, arguments.demo_pack, confirm_sheffield=arguments.confirm_sheffield)
    print("Keystone demo acceptance passed.")
