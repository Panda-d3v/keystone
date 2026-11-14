import json
import os
from datetime import date
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

from api.loader.seed import load_seed
from api.rules.exposure import compute_exposure
from api.rules.rates import apply_change, read_rate
from contracts.models import ChangeEvent


def test_version_history_and_demo_exposure():
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    archive = Path("docs/reference/keystone-demo-pack.zip")
    if not dsn or not archive.is_file():
        pytest.skip("provide KEYSTONE_TEST_DATABASE_URL and the demo ZIP")
    records = json.loads(Path("contracts/fixtures/changes.json").read_text())
    change = ChangeEvent.model_validate(records[0])
    with psycopg.connect(dsn) as connection:
        connection.execute("CREATE SCHEMA rates_test")
        connection.execute("SET LOCAL search_path TO rates_test")
        try:
            load_seed(connection, archive)
            assert apply_change(connection, change) == 12
            assert apply_change(connection, change) == 12
            with pytest.raises(ValueError, match="different payload"):
                apply_change(connection, change.model_copy(update={"new_rate": 0.40}))
            assert read_rate(connection, 11, "841391", "CN", change.effective_date) == Decimal("0.25")
            assert read_rate(connection, 12, "841391", "CN", change.effective_date) == Decimal("0.50")
            assert read_rate(connection, 12, "841391", "CN", date(2026, 11, 30)) == Decimal("0.25")

            exposure = compute_exposure(connection, change, 12)
            assert exposure.affected_parts == exposure.open_po_lines == 33
            assert exposure.added_duty_usd == 470687
            assert exposure.annualized_added_duty_usd == 617061

            assert all(line.math for line in exposure.lines)

            connection.execute("UPDATE suppliers SET country_iso2 = 'GB' WHERE supplier_id = 'S001'")
            default = compute_exposure(connection, change, 12)
            verified = compute_exposure(connection, change, 12, {("S001", "MF-8413-005")})
            assert default == exposure
            uk_line = next(line for line in verified.lines if line.po_id == "PO-4504")
            assert uk_line.added_duty_usd == 30720
            assert "25.00% − 15.00%" in uk_line.math
            connection.execute("UPDATE suppliers SET country_iso2 = 'CN' WHERE supplier_id = 'S001'")

            restricted = change.model_copy(update={"id": "CN-only", "countries": ["CN"], "new_rate": 0.55})
            assert apply_change(connection, restricted) == 13
            assert read_rate(connection, 13, "841391", "CN", change.effective_date) == Decimal("0.55")
            assert read_rate(connection, 13, "841391", "IN", change.effective_date) == Decimal("0.50")
            assert compute_exposure(connection, change, 12) == exposure
        finally:
            connection.rollback()
