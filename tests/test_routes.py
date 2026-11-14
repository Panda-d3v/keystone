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

            app.dependency_overrides[get_connection] = dependency
            with TestClient(app) as client:
                assert client.get("/changes").json()[0]["id"] == change.id
                exposure = Exposure.model_validate(client.get(f"/changes/{change.id}/exposure").json())
                assert (exposure.added_duty_usd, exposure.annualized_added_duty_usd) == (470687, 617061)
                decision = DecisionCheck.model_validate(client.get("/decisions").json()[0])
                assert decision.status == "broken"
                evidence = EvidenceStatus.model_validate(client.get("/evidence/S007/MF-8413-005").json())
                assert evidence.status == "needs_review"
                assert next(row for row in evidence.requirements if row.id == "EV-UK-01").reason
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
                assert client.get("/audit").json() == [response.json()["audit_event"]]
            with connect() as connection:
                assert verify_chain(connection)
        finally:
            app.dependency_overrides.pop(get_connection, None)
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
