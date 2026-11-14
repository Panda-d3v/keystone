import json
import os
from pathlib import Path

import psycopg
import pytest

from api.loader.seed import load_seed
from api.rules.decisions import check_decision
from api.rules.rates import apply_change
from contracts.models import ChangeEvent


def test_casing_award_breaks_and_prices_both_sheffield_scenarios():
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    archive = Path("docs/reference/keystone-demo-pack.zip")
    if not dsn or not archive.is_file():
        pytest.skip("provide a PostgreSQL DSN and the demo ZIP")
    change = ChangeEvent.model_validate(json.loads(Path("contracts/fixtures/changes.json").read_text())[0])
    with psycopg.connect(dsn) as connection:
        connection.execute("CREATE SCHEMA decisions_test")
        connection.execute("SET LOCAL search_path TO decisions_test")
        try:
            load_seed(connection, archive)
            version = apply_change(connection, change)
            check = check_decision(connection, "D-2026-031", change, version)
            assert check.status == "broken"
            assert check.incumbent_annual_usd == 1192560
            assert check.alternative_with_proof_annual_usd - check.incumbent_annual_usd == -49690
            assert check.alternative_without_proof_annual_usd - check.incumbent_annual_usd == 178884
        finally:
            connection.rollback()
