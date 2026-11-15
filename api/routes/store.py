"""PostgreSQL persistence for data produced by the intake and drafting agents."""

from psycopg import Connection
from psycopg.types.json import Jsonb

from contracts.models import Action, EvidenceItem

SCHEMA = """
CREATE TABLE IF NOT EXISTS evidence_scopes (
    supplier_id text REFERENCES suppliers,
    part_no text REFERENCES parts,
    expected_batches text[] NOT NULL,
    PRIMARY KEY (supplier_id, part_no)
);
CREATE TABLE IF NOT EXISTS evidence_records (
    supplier_id text REFERENCES suppliers,
    part_no text REFERENCES parts,
    doc_id text,
    kind text,
    batch_id text,
    payload jsonb NOT NULL,
    PRIMARY KEY (supplier_id, part_no, doc_id, kind, batch_id)
);
CREATE TABLE IF NOT EXISTS proposed_actions (
    id text PRIMARY KEY,
    payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS declined_actions (
    action_id text PRIMARY KEY,
    audit_id text NOT NULL
);
CREATE TABLE IF NOT EXISTS sent_actions (
    action_id text PRIMARY KEY REFERENCES proposed_actions,
    decision_number integer GENERATED ALWAYS AS IDENTITY (START WITH 44) UNIQUE,
    draft_email text NOT NULL,
    audit_id text NOT NULL
);
"""


def initialize_store(connection: Connection) -> None:
    connection.execute("SELECT pg_advisory_xact_lock(2961202615)")
    connection.execute(SCHEMA)


def record_expected_batches(
    connection: Connection, supplier_id: str, part_no: str, batch_ids: set[str]
) -> None:
    initialize_store(connection)
    connection.execute(
        "INSERT INTO evidence_scopes VALUES (%s, %s, %s) "
        "ON CONFLICT (supplier_id, part_no) DO UPDATE SET expected_batches = EXCLUDED.expected_batches",
        (supplier_id, part_no, sorted(batch_ids)),
    )


def save_evidence(connection: Connection, item: EvidenceItem) -> None:
    initialize_store(connection)
    connection.execute(
        "INSERT INTO evidence_records VALUES (%s, %s, %s, %s, %s, %s) "
        "ON CONFLICT (supplier_id, part_no, doc_id, kind, batch_id) DO UPDATE SET payload = EXCLUDED.payload",
        (item.supplier_id, item.part_no, item.doc_id, item.kind, item.batch_id or "",
         Jsonb(item.model_dump(mode="json"))),
    )


def save_action(connection: Connection, action: Action) -> None:
    initialize_store(connection)
    connection.execute(
        "INSERT INTO proposed_actions VALUES (%s, %s) "
        "ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload",
        (action.id, Jsonb(action.model_dump(mode="json"))),
    )
