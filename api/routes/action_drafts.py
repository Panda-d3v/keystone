"""Draft supplier requests using the affected award and documented evidence gaps."""

from psycopg import Connection

from api.agents.a5_actions import EvidenceGap, draft_actions
from api.rules.decisions import evaluate_decision
from contracts.models import ChangeEvent, DecisionCheck

from . import evidence_status
from .store import initialize_store, save_action

SCHEMA = """
CREATE TABLE IF NOT EXISTS intake_action_keys (
    change_id text,
    supplier_id text,
    part_no text,
    action_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    PRIMARY KEY (change_id, supplier_id, part_no)
);
"""


def refresh_evidence_requests(connection: Connection) -> list[str]:
    if not connection.execute("SELECT to_regclass('tariff_rate_versions')").fetchone()[0]:
        return []
    latest = connection.execute(
        "SELECT version, change_event FROM tariff_rate_versions WHERE change_id IS NOT NULL "
        "ORDER BY version DESC LIMIT 1"
    ).fetchone()
    if latest is None:
        return []
    version, payload = latest
    change = ChangeEvent.model_validate(payload)
    initialize_store(connection)
    connection.execute(SCHEMA)

    candidates: dict[tuple[str, str], DecisionCheck] = {}
    for decision_id, subject in connection.execute(
        "SELECT decision_id, subject FROM decisions WHERE type = 'supplier_award' ORDER BY decision_id"
    ):
        check, supplier = evaluate_decision(connection, decision_id, change, version)
        if check.status != "broken" or check.alternative_with_proof_annual_usd >= check.incumbent_annual_usd:
            continue
        for part in subject.split(";"):
            candidates.setdefault((supplier, part), check)

    gaps = []
    for supplier, part, name, description, batches in connection.execute(
        """
        SELECT e.supplier_id, e.part_no, s.name, p.description, e.expected_batches
        FROM evidence_scopes e JOIN suppliers s USING (supplier_id) JOIN parts p USING (part_no)
        WHERE s.country_iso2 = 'GB'
          AND EXISTS (SELECT 1 FROM evidence_records r
                      WHERE r.supplier_id = e.supplier_id AND r.part_no = e.part_no)
        ORDER BY e.supplier_id, e.part_no
        """
    ):
        decision = candidates.get((supplier, part))
        if decision is not None:
            gaps.append(EvidenceGap(
                status=evidence_status(connection, supplier, part, change.effective_date),
                supplier_name=name, part_description=description, batch_ids=batches, decision=decision,
            ))

    active_ids = []
    new_ids = []
    for draft in draft_actions([], gaps):
        part = draft.action.part_ids[0]
        key = (change.id, draft.to_supplier, part)
        row = connection.execute(
            "SELECT action_number FROM intake_action_keys "
            "WHERE change_id = %s AND supplier_id = %s AND part_no = %s", key,
        ).fetchone()
        if row is None:
            row = connection.execute(
                "INSERT INTO intake_action_keys (change_id, supplier_id, part_no) "
                "VALUES (%s, %s, %s) RETURNING action_number", key,
            ).fetchone()
        action_id = f"ACT-{row[0]:04d}"
        active_ids.append(action_id)
        if connection.execute("SELECT 1 FROM sent_actions WHERE action_id = %s", (action_id,)).fetchone():
            continue
        if not connection.execute("SELECT 1 FROM proposed_actions WHERE id = %s", (action_id,)).fetchone():
            new_ids.append(action_id)
        save_action(connection, draft.action.model_copy(update={"id": action_id}))

    connection.execute(
        """
        DELETE FROM proposed_actions p USING intake_action_keys k
        WHERE p.id = 'ACT-' || lpad(k.action_number::text, greatest(4, length(k.action_number::text)), '0')
          AND NOT (p.id = ANY(%s))
          AND NOT EXISTS (SELECT 1 FROM sent_actions WHERE action_id = p.id)
        """,
        (active_ids,),
    )
    return new_ids
