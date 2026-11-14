import os
from pathlib import Path

import psycopg
import pytest
from psycopg import sql

from api.graph.where_used import load_graph, where_used
from api.loader.seed import hts_status, load_seed


def test_hts_status_preserves_offline_and_unresolved_distinction():
    assert hts_status("8413.91.90.95", "841391", {"8413919095"}) == "verified"
    assert hts_status("8413919095", "841391", set()) == "unresolved"
    assert hts_status("8413919095", "848130", None) == "unresolved"
    assert hts_status("8413919095", "841391", None) == "unverified"


def test_demo_seed_and_where_used():
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    demo_pack = Path(os.environ.get("KEYSTONE_DEMO_PACK", "docs/reference/keystone-demo-pack.zip"))
    if not dsn or not demo_pack.is_file():
        pytest.skip("provide KEYSTONE_TEST_DATABASE_URL and the demo ZIP")

    with psycopg.connect(dsn) as connection:
        connection.execute("CREATE SCHEMA seed_test")
        connection.execute("SET LOCAL search_path TO seed_test")
        try:
            for _ in range(2):
                counts = load_seed(connection, demo_pack, {"8413919095"})
                for table, count in (("parts", 100), ("purchase_orders", 66), ("bom_lines", 158)):
                    assert counts[table] == count
                    assert connection.execute(
                        sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier(table))
                    ).fetchone() == (count,)
                assert counts["unresolved_hts10"] > 0
                assert counts["unverified_hts10"] == 0
            graph = load_graph(connection)
            result = where_used(graph, "MF-8413-005")
            assert result.product_ids == ("P-ANSI-3X2-10", "P-SPLIT-6X4-12", "P-VIL-4X3-13")
            assert result.purchase_order_ids == ("PO-4504",)
            assert not where_used(graph, "missing").product_ids
        finally:
            connection.rollback()
