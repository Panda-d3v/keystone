"""T41: reset clears everything the demo created and restarts the counters."""

import os
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
from fastapi.testclient import TestClient
from psycopg import sql

from api.audit.log import append_event
from api.routes import get_connection
from api.routes.intake import SCHEMA as INTAKE_SCHEMA
from api.routes.store import initialize_store
from infra.app import app
from scripts.reset_demo import RUNTIME_TABLES, reset_demo
from scripts.seed_demo import seed_demo

ARCHIVE = Path("docs/reference/keystone-demo-pack.zip")


@pytest.fixture
def schema_dsn():
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not dsn or not ARCHIVE.is_file():
        pytest.skip("provide a PostgreSQL DSN and the demo ZIP")
    schema = f"reset_test_{uuid4().hex}"
    with psycopg.connect(dsn, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            yield dsn, schema
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


def _connect(dsn, schema):
    return psycopg.connect(dsn, options=f"-c search_path={schema}")


def _dirty(connection):
    seed_demo(connection, ARCHIVE)
    initialize_store(connection)
    connection.execute(INTAKE_SCHEMA)
    first = connection.execute(
        "INSERT INTO bulletin_intake (doc_id, sha256) VALUES ('HTA-2026-118', 'x') RETURNING change_number"
    ).fetchone()[0]
    connection.execute("INSERT INTO intake_documents VALUES ('d', 'f.pdf', 'application/pdf', '\\x00')")
    append_event(connection, actor="test", type="document_ingested", entity_id="d")
    connection.commit()
    return first


def test_reset_clears_runtime_and_restarts_counters(schema_dsn):
    dsn, schema = schema_dsn
    with _connect(dsn, schema) as connection:
        assert _dirty(connection) == 7
        result = reset_demo(connection, ARCHIVE)
        connection.commit()

        assert {"bulletin_intake", "intake_documents", "audit_events"} <= set(result["cleared_tables"])
        assert set(result["cleared_tables"]) <= set(RUNTIME_TABLES)
        assert result["seeded"]["parts"] == 100 and result["seeded"]["purchase_orders"] == 66
        for table in ("bulletin_intake", "intake_documents", "audit_events", "proposed_actions"):
            assert connection.execute(sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))).fetchone()[0] == 0
        # The next bulletin is CE-0007 again.
        again = connection.execute(
            "INSERT INTO bulletin_intake (doc_id, sha256) VALUES ('HTA-2026-118', 'x') RETURNING change_number"
        ).fetchone()[0]
        assert again == 7
        assert connection.execute("SELECT count(*) FROM parts").fetchone()[0] == 100


def test_reset_on_fresh_database(schema_dsn):
    dsn, schema = schema_dsn
    with _connect(dsn, schema) as connection:
        result = reset_demo(connection, ARCHIVE)
        assert result["seeded"]["bom_lines"] == 158


def test_reset_route_is_off_unless_enabled(schema_dsn, monkeypatch):
    dsn, schema = schema_dsn

    def dependency():
        with _connect(dsn, schema) as connection:
            yield connection

    app.dependency_overrides[get_connection] = dependency
    try:
        with TestClient(app) as client:
            monkeypatch.delenv("KEYSTONE_ALLOW_RESET", raising=False)
            refused = client.post("/admin/reset")
            assert refused.status_code == 403
            assert "KEYSTONE_ALLOW_RESET=1" in refused.json()["detail"]

            monkeypatch.setenv("KEYSTONE_ALLOW_RESET", "1")
            ok = client.post("/admin/reset")
            assert ok.status_code == 200, ok.text
            body = ok.json()
            assert body["message"].startswith("The demo is back to its starting state")
            assert body["seeded"]["parts"] == 100
    finally:
        app.dependency_overrides.pop(get_connection, None)


def test_every_table_is_either_seed_data_or_reset():
    """A new runtime table must be added to RUNTIME_TABLES or the reset goes stale."""
    import re

    from api.loader.seed import TABLES as SEED_TABLES

    created = set()
    for path in Path("api").rglob("*"):
        if path.suffix in {".py", ".sql"}:
            created |= set(re.findall(r"CREATE TABLE IF NOT EXISTS (\w+)", path.read_text()))
    seed = set(SEED_TABLES)
    assert created - seed - set(RUNTIME_TABLES) == set()
