"""Append and verify the Keystone audit trail in PostgreSQL."""

import hashlib
import json
from datetime import datetime, timezone
from uuid import uuid4

from psycopg import Connection
from psycopg.rows import dict_row

from contracts.models import AuditEvent

SCHEMA = """
CREATE TABLE IF NOT EXISTS audit_events (
    sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id text NOT NULL UNIQUE,
    occurred_at timestamptz NOT NULL,
    actor text NOT NULL,
    type text NOT NULL,
    entity_id text NOT NULL,
    previous_hash text,
    hash text NOT NULL
)
"""
FIELDS = "id, occurred_at, actor, type, entity_id, previous_hash, hash"


def initialize_audit(connection: Connection) -> None:
    with connection.transaction():
        connection.execute("SELECT pg_advisory_xact_lock(2961202626)")
        connection.execute(SCHEMA)


def event_hash(event: AuditEvent) -> str:
    payload = event.model_dump(mode="json", exclude={"hash"})
    payload["occurred_at"] = event.occurred_at.astimezone(timezone.utc).isoformat()
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def append_event(connection: Connection, *, actor: str, type: str, entity_id: str) -> AuditEvent:
    with connection.transaction():
        initialize_audit(connection)
        previous = connection.execute(
            "SELECT hash FROM audit_events ORDER BY sequence DESC LIMIT 1"
        ).fetchone()
        event = AuditEvent(
            id=f"AUD-{uuid4()}",
            occurred_at=datetime.now(timezone.utc),
            actor=actor,
            type=type,
            entity_id=entity_id,
            previous_hash=previous[0] if previous else None,
            hash="",
        )
        event.hash = event_hash(event)
        connection.execute(
            "INSERT INTO audit_events (id, occurred_at, actor, type, entity_id, previous_hash, hash) "
            "VALUES (%(id)s, %(occurred_at)s, %(actor)s, %(type)s, %(entity_id)s, %(previous_hash)s, %(hash)s)",
            event.model_dump(),
        )
    return event


def event_from_row(row: dict) -> AuditEvent:
    event = AuditEvent.model_validate(row)
    event.occurred_at = event.occurred_at.astimezone(timezone.utc)
    return event


def list_events(connection: Connection) -> list[AuditEvent]:
    initialize_audit(connection)
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(f"SELECT {FIELDS} FROM audit_events ORDER BY sequence DESC")
        return [event_from_row(row) for row in cursor]


def verify_chain(connection: Connection) -> bool:
    previous_hash = None
    for event in reversed(list_events(connection)):
        if event.previous_hash != previous_hash or event.hash != event_hash(event):
            return False
        previous_hash = event.hash
    return True
