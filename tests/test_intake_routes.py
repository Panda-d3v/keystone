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
from api.agents.a1_intake import route_bytes
from api.agents.a3_evidence import extract_evidence
from api.agents.llm import LLMClient
from api.routes import get_connection
from contracts.models import ChangeEvent
from infra.app import app
from scripts.seed_demo import seed_demo
from tests.agents.test_a3_evidence import SHEFFIELD_ANSWER, Stub


def test_uploads_persist_exposure_and_evidence_once(monkeypatch, tmp_path):
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    archive = Path("docs/reference/keystone-demo-pack.zip")
    if not dsn or not archive.is_file():
        pytest.skip("provide a PostgreSQL DSN and the demo ZIP")
    filename = "01_bulletin_email_HTA-2026-118.eml"
    with ZipFile(archive) as zip_file:
        email = zip_file.read(f"keystone_demo/docs/{filename}")
        scan_name = "03_scan_mill_cert_Sheffield_MF-8413-005.jpg"
        scan = zip_file.read(f"keystone_demo/docs/{scan_name}")
    fixture = json.loads(Path("contracts/fixtures/changes.json").read_text())[0]
    change = ChangeEvent.model_validate(fixture)

    def extract(item, *, change_id):
        assert item.envelope.doc_id == "HTA-2026-118"
        extracted = change.model_copy(update={"id": change_id, "measure": "Section 232 steel derivatives"})
        return ChangeExtraction(item.envelope.doc_id, extracted, {}, {})

    stub = Stub({
        "IntakeClassification": {
            "kind": "supplier_document", "confidence": 0.9, "reason": "certificate",
        },
        "VisionEvidenceDraft": SHEFFIELD_ANSWER,
    })
    llm = LLMClient(stub, cache_dir=tmp_path, replay=False)
    monkeypatch.setattr("api.routes.intake.extract_change", extract)
    monkeypatch.setattr(
        "api.routes.intake.route_bytes",
        lambda data, filename: route_bytes(data, filename, client=llm),
    )
    monkeypatch.setattr(
        "api.routes.intake.extract_evidence",
        lambda item, **kwargs: extract_evidence(item, client=llm, **kwargs),
    )
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
                seed_demo(connection, archive)
            app.dependency_overrides[get_connection] = dependency
            with TestClient(app) as client:
                for _ in range(2):
                    response = client.post("/intake", files={"file": (filename, email, "message/rfc822")})
                    assert response.status_code == 200, response.text
                    assert response.json()["change_ids"] == ["CE-0007"]
                response = client.get("/changes/CE-0007/exposure")
                assert response.json()["added_duty_usd"] == 470687
                for _ in range(2):
                    response = client.post("/intake", files={"file": (scan_name, scan, "image/jpeg")})
                    assert response.status_code == 200, response.text
                    ids = response.json()
                    assert len(ids["evidence_doc_ids"]) == 1
                    assert ids["review_doc_ids"] == ids["evidence_doc_ids"]
                passport = client.get("/evidence/S007/MF-8413-005").raise_for_status().json()
                assert passport["status"] == "needs_review"
                assert {item["batch_id"] for item in passport["items"]} == {"SF-24117", "SF-24121"}
                assert [row["status"] for row in passport["requirements"]] == [
                    "checked", "checked", "checked", "needs_review", "missing",
                ]
                refusal = passport["requirements"][3]
                assert refusal["reason"] and refusal["citations"][0]["bbox"] == [0.1, 0.28, 0.65, 0.31]
                assert [event["type"] for event in client.get("/audit").json()] == [
                    "evidence_refused", "evidence_extracted", "document_ingested",
                    "change_extracted", "document_ingested",
                ]
                assert llm.stats.model_calls == 2
        finally:
            app.dependency_overrides.pop(get_connection, None)
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
