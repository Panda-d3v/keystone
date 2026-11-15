import json
import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql

from api.audit.log import verify_chain
from api.loader.seed import load_seed
from api.routes import get_connection
from api.routes.store import record_expected_batches, save_action, save_evidence
from api.rules.rates import apply_change
from contracts.models import (
    Action, ChangeEvent, DecisionCheck, EvidenceItem, EvidenceStatus, Exposure, SendActionResponse,
)
from infra.app import app


def test_live_routes_against_demo_contracts():
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    archive = Path("docs/reference/keystone-demo-pack.zip")
    if not dsn or not archive.is_file():
        pytest.skip("provide a PostgreSQL DSN and the demo ZIP")

    def fixture(name):
        return json.loads((Path("contracts/fixtures") / f"{name}.json").read_text())

    schema = f"routes_test_{uuid4().hex}"
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            def connect():
                return psycopg.connect(dsn, options=f"-c search_path={schema}")

            def dependency():
                with connect() as connection:
                    yield connection

            change = ChangeEvent.model_validate(fixture("changes")[0])
            action = Action.model_validate(fixture("actions")[0])
            with connect() as connection:
                load_seed(connection, archive)
                apply_change(connection, change)
                record_expected_batches(connection, "S007", "MF-8413-005", {"SF-24117", "SF-24121"})
                for item in fixture("evidence")["items"]:
                    save_evidence(connection, EvidenceItem.model_validate(item))
                save_action(connection, action)
                save_action(connection, action.model_copy(update={"id": "ACT-0002", "rank": 2}))

            app.dependency_overrides[get_connection] = dependency
            with TestClient(app) as client:
                assert client.get("/changes").json()[0]["id"] == change.id
                exposure = Exposure.model_validate(client.get(f"/changes/{change.id}/exposure").json())
                assert (exposure.added_duty_usd, exposure.annualized_added_duty_usd) == (470687, 617061)
                decision = DecisionCheck.model_validate(client.get("/decisions").json()[0])
                assert decision.status == "broken"
                assert decision.incumbent_before_annual_usd == 993800
                assert decision.incumbent_delta_annual_usd == 198760
                assert decision.alternative_with_proof_delta_usd == -49690
                assert decision.alternative_without_proof_delta_usd == 178884
                po = next(line for line in exposure.lines if line.po_id == "PO-4504")
                assert (po.old_duty_usd, po.new_duty_usd) == (76800, 153600)
                graph = client.get(f"/changes/{change.id}/lineage").raise_for_status().json()
                assert graph == fixture("lineage")
                edges = {(edge["source"], edge["target"]) for edge in graph["edges"]}
                witness = [
                    "bulletin:HTA-2026-118", "change:CE-0007", "rate:841391:all",
                    "assumption:A-0311", "decision:D-2026-031", "part:MF-8413-005",
                    "purchase_order:PO-4504:1",
                ]
                assert all(pair in edges for pair in zip(witness, witness[1:]))
                assert client.get("/changes/unknown/lineage").status_code == 404
                evidence = EvidenceStatus.model_validate(client.get("/evidence/S007/MF-8413-005").json())
                assert evidence.status == "needs_review"
                assert next(row for row in evidence.requirements if row.id == "EV-UK-01").reason
                assert len(client.get("/actions").json()) == 2
                declined = client.post("/actions/ACT-0002/decline").raise_for_status().json()
                assert declined["state"] == "declined"
                assert declined["audit_event"]["type"] == "action_declined"
                assert client.post("/actions/ACT-0002/decline").json() == declined
                assert client.post("/actions/ACT-0002/send", json={"draft_email": "Draft"}).status_code == 409
                assert client.get("/actions").json() == fixture("actions")
                url = f"/actions/{action.id}/send"
                response = client.post(url, json={"draft_email": "Edited draft"})
                response.raise_for_status()
                send = SendActionResponse.model_validate(response.json())
                assert send.decision_id == "D-2026-044"
                assert len(send.pending_approvals) == 2
                assert client.post(url, json={"draft_email": "Edited draft"}).json() == response.json()
                assert client.post(url, json={"draft_email": "Different draft"}).status_code == 409
                assert client.get("/actions").json() == []
                assert client.post(url.replace("/send", "/decline")).status_code == 409
                assert client.get("/audit").json() == [response.json()["audit_event"], declined["audit_event"]]
            with connect() as connection:
                assert verify_chain(connection)
        finally:
            app.dependency_overrides.pop(get_connection, None)
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
