import json
import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql

from api.audit.log import append_event
from api.routes import get_connection
from api.routes.store import save_action
from api.rules.rates import apply_change
from contracts.models import Action, ChangeEvent
from infra.app import app
from scripts.seed_demo import seed_demo


def test_reset_twice_restores_seeded_demo_database(monkeypatch):
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    archive = Path("docs/reference/keystone-demo-pack.zip")
    if not dsn or not archive.is_file():
        pytest.skip("provide a PostgreSQL DSN and the demo ZIP")
    schema = f"reset_test_{uuid4().hex}"
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            def connect():
                return psycopg.connect(dsn, options=f"-c search_path={schema}")

            def dependency():
                with connect() as connection:
                    yield connection

            action = Action.model_validate(json.loads(Path("contracts/fixtures/actions.json").read_text())[0])
            change = ChangeEvent.model_validate(json.loads(Path("contracts/fixtures/changes.json").read_text())[0])
            with connect() as connection:
                seed_demo(connection, archive)
            app.dependency_overrides[get_connection] = dependency
            monkeypatch.delenv("KEYSTONE_DEMO_RESET_TOKEN", raising=False)
            with TestClient(app) as client:
                assert client.post("/admin/reset").status_code == 404
                monkeypatch.setenv("KEYSTONE_DEMO_RESET_TOKEN", "test-reset-only")
                assert client.post("/admin/reset").status_code == 403
                for _ in range(2):
                    with connect() as connection:
                        assert apply_change(connection, change) == 12
                        save_action(connection, action)
                        append_event(connection, actor="test", type="document_ingested", entity_id="demo")
                    sent = client.post(f"/actions/{action.id}/send", json={"draft_email": "Draft"}).raise_for_status().json()
                    assert sent["decision_id"] == "D-2026-044"
                    counts = client.post("/admin/reset", headers={
                        "X-Demo-Reset-Token": "test-reset-only",
                    }).raise_for_status().json()
                    assert counts["parts"] == 100
                    assert client.get("/changes").json() == []
                    assert client.get("/actions").json() == []
                    assert client.get("/audit").json() == []
        finally:
            app.dependency_overrides.pop(get_connection, None)
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
