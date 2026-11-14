import json
import os
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql

from api.agents.a2_change import ChangeExtraction
from api.loader.seed import load_seed
from api.routes import get_connection
from contracts.models import ChangeEvent
from infra.app import app


def test_bulletin_upload_persists_version_and_audit_once(monkeypatch):
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    archive = Path("docs/reference/keystone-demo-pack.zip")
    if not dsn or not archive.is_file():
        pytest.skip("provide a PostgreSQL DSN and the demo ZIP")
    filename = "01_bulletin_email_HTA-2026-118.eml"
    with ZipFile(archive) as zip_file:
        email = zip_file.read(f"keystone_demo/docs/{filename}")
    fixture = json.loads(Path("contracts/fixtures/changes.json").read_text())[0]
    change = ChangeEvent.model_validate(fixture)

    def extract(item, *, change_id):
        assert item.envelope.doc_id == "HTA-2026-118"
        extracted = change.model_copy(update={"id": change_id, "measure": "Section 232 steel derivatives"})
        return ChangeExtraction(item.envelope.doc_id, extracted, {}, {})

    monkeypatch.setattr("api.routes.intake.extract_change", extract)
    schema = f"intake_test_{uuid4().hex}"
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            def connect():
                return psycopg.connect(dsn, options=f"-c search_path={schema}")

            def dependency():
                with connect() as connection:
                    yield connection

            with connect() as connection:
                load_seed(connection, archive)
            app.dependency_overrides[get_connection] = dependency
            with TestClient(app) as client:
                for _ in range(2):
                    response = client.post("/intake", files={"file": (filename, email, "message/rfc822")})
                    assert response.status_code == 200, response.text
                    assert response.json()["change_ids"] == ["CE-0007"]
                response = client.get("/changes/CE-0007/exposure")
                assert response.json()["added_duty_usd"] == 470687
                assert [event["type"] for event in client.get("/audit").json()] == [
                    "change_extracted", "document_ingested",
                ]
        finally:
            app.dependency_overrides.pop(get_connection, None)
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
