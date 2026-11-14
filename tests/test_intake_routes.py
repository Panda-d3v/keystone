import os
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql

from api.agents.llm import LLMClient
from api.routes import get_connection
from infra.app import app
from scripts.seed_demo import seed_demo
from tests.agents.test_a2_change import GOOD
from tests.agents.test_a3_evidence import SHEFFIELD_ANSWER, Stub


def test_uploads_persist_exposure_and_evidence_once(monkeypatch, tmp_path):
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    archive = Path("docs/reference/keystone-demo-pack.zip")
    if not dsn or not archive.is_file():
        pytest.skip("provide a PostgreSQL DSN and the demo ZIP")
    filename = "01_bulletin_email_HTA-2026-118.eml"
    with ZipFile(archive) as zip_file:
        email = zip_file.read(f"keystone_demo/docs/{filename}")
        pdf = zip_file.read("keystone_demo/docs/HTA-2026-118_trade_advisory.pdf")
        scan_name = "03_scan_mill_cert_Sheffield_MF-8413-005.jpg"
        scan = zip_file.read(f"keystone_demo/docs/{scan_name}")
    stub = Stub({
        "IntakeClassification": {
            "kind": "supplier_document", "confidence": 0.9, "reason": "certificate",
        },
        "ChangeDraft": GOOD,
        "VisionEvidenceDraft": {
            **SHEFFIELD_ANSWER,
            "part_no": {**SHEFFIELD_ANSWER["part_no"], "value": "mf8413005"},
        },
    })
    llm = LLMClient(stub, cache_dir=tmp_path, replay=False)
    monkeypatch.setattr("api.agents.llm._default_client", llm)
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
                assert client.get("/documents/missing").status_code == 404
                for _ in range(2):
                    response = client.post("/intake", files={"file": (filename, email, "message/rfc822")})
                    assert response.status_code == 200, response.text
                    assert response.json()["change_ids"] == ["CE-0007"]
                response = client.get("/documents/HTA-2026-118").raise_for_status()
                assert response.content == pdf
                assert response.headers["content-type"] == "application/pdf"
                response = client.get("/changes/CE-0007/exposure")
                assert response.json()["added_duty_usd"] == 470687
                for _ in range(2):
                    response = client.post("/intake", files={"file": (scan_name, scan, "image/jpeg")})
                    assert response.status_code == 200, response.text
                    ids = response.json()
                    assert len(ids["evidence_doc_ids"]) == 1
                    assert ids["review_doc_ids"] == ids["evidence_doc_ids"]
                source = client.get(f"/documents/{ids['evidence_doc_ids'][0]}").raise_for_status()
                assert source.content == scan
                assert source.headers["content-type"] == "image/jpeg"
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
                assert llm.stats.model_calls == 3

                replay = LLMClient(cache_dir=tmp_path, replay=True)
                monkeypatch.setattr("api.agents.llm._default_client", replay)
                assert client.post("/intake", files={
                    "file": (filename, email, "message/rfc822"),
                }).raise_for_status().json()["change_ids"] == ["CE-0007"]
                assert client.post("/intake", files={
                    "file": (scan_name, scan, "image/jpeg"),
                }).raise_for_status().json()["evidence_doc_ids"] == ids["evidence_doc_ids"]
                assert replay.stats.cache_hits == 3 and replay.stats.model_calls == 0
                assert len(client.get("/audit").json()) == 5
        finally:
            app.dependency_overrides.pop(get_connection, None)
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
