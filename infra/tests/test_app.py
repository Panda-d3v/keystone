import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import psycopg
from fastapi.testclient import TestClient
from infra.app import app

client = TestClient(app)

def test_health_matches_fixture():
    expected = json.loads((Path(__file__).parent / "fixtures/health.json").read_text())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == expected

def test_readiness_requires_database(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://unreachable")
    with patch("infra.app.psycopg.connect", side_effect=psycopg.OperationalError("private details")):
        response = client.get("/ready")
    assert response.status_code == 503
    assert "private details" not in response.text

def test_readiness_checks_connection(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://test")
    connection = MagicMock()
    with patch("infra.app.psycopg.connect") as connect:
        connect.return_value.__enter__.return_value = connection
        assert client.get("/ready").status_code == 200
        connection.execute.assert_called_once_with("SELECT 1")
