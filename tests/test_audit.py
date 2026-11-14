import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import psycopg
import pytest
from psycopg import sql

from api.audit.log import append_event, initialize_audit, list_events, verify_chain


def test_audit_serializes_writers_and_detects_tampering():
    dsn = os.environ.get("KEYSTONE_TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        pytest.skip("provide KEYSTONE_TEST_DATABASE_URL or DATABASE_URL")

    schema = f"audit_test_{uuid4().hex}"
    with psycopg.connect(dsn, autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        connection.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
        try:
            initialize_audit(connection)
            assert verify_chain(connection)

            def append(index):
                with psycopg.connect(dsn, options=f"-c search_path={schema}") as writer:
                    return append_event(writer, actor="test", type="rule_run", entity_id=f"CE-{index}")

            with ThreadPoolExecutor(max_workers=4) as executor:
                written = list(executor.map(append, range(8)))

            events = list_events(connection)
            assert {event.id for event in events} == {event.id for event in written}
            assert events[0].previous_hash == events[1].hash
            assert verify_chain(connection)

            connection.execute(
                "UPDATE audit_events SET actor = %s WHERE id = %s", ("changed", events[-1].id)
            )
            assert not verify_chain(connection)
        finally:
            connection.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
