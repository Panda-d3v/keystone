"""Keystone's seven shared application endpoints."""

import os
from collections.abc import Iterator
from datetime import date
from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row

from api.audit.log import FIELDS, append_event, event_from_row, list_events
from api.rules.decisions import check_decision
from api.rules.evidence import check_uk_evidence
from api.rules.exposure import compute_exposure
from api.rules.rates import initialize_rates
from contracts.models import (
    Action, AuditEvent, ChangeEvent, DecisionCheck, EvidenceItem, EvidenceStatus,
    Exposure, PendingApproval, SendActionRequest, SendActionResponse,
)

from .store import initialize_store

router = APIRouter()
APPROVERS = (
    PendingApproval(id="sourcing-manager", name="Sourcing Manager"),
    PendingApproval(id="trade-compliance", name="Trade Compliance"),
)


def get_connection() -> Iterator[psycopg.Connection]:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise HTTPException(503, "Database is unavailable")
    with psycopg.connect(database_url) as connection:
        yield connection


Database = Annotated[psycopg.Connection, Depends(get_connection)]


def evidence_status(
    connection: psycopg.Connection, supplier_id: str, part_no: str, on_date: date
) -> EvidenceStatus:
    scope = connection.execute(
        "SELECT expected_batches FROM evidence_scopes WHERE supplier_id = %s AND part_no = %s",
        (supplier_id, part_no),
    ).fetchone()
    items = [
        EvidenceItem.model_validate(payload)
        for (payload,) in connection.execute(
            """
            SELECT payload FROM evidence_records
            WHERE supplier_id = %s AND part_no = %s ORDER BY doc_id, kind, batch_id
            """,
            (supplier_id, part_no),
        )
    ]
    return check_uk_evidence(supplier_id, part_no, set(scope[0]) if scope else set(), items, on_date)


@router.get("/changes", operation_id="changes")
def changes(connection: Database) -> list[ChangeEvent]:
    initialize_rates(connection)
    return [
        ChangeEvent.model_validate(payload)
        for (payload,) in connection.execute(
            "SELECT change_event FROM tariff_rate_versions WHERE change_id IS NOT NULL ORDER BY version DESC"
        )
    ]


@router.get("/changes/{id}/exposure", operation_id="exposure")
def exposure(id: str, connection: Database) -> Exposure:
    initialize_rates(connection)
    row = connection.execute(
        "SELECT version, change_event FROM tariff_rate_versions WHERE change_id = %s", (id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Change not found")
    version, event = row
    change = ChangeEvent.model_validate(event)
    initialize_store(connection)
    verified = {
        (supplier, part)
        for supplier, part in connection.execute(
            """
            SELECT e.supplier_id, e.part_no FROM evidence_scopes e
            JOIN suppliers s USING (supplier_id) WHERE s.country_iso2 = 'GB'
            """
        )
        if evidence_status(connection, supplier, part, change.effective_date).status == "verified"
    }
    return compute_exposure(connection, change, version, verified)


@router.get("/decisions", operation_id="decisions")
def decisions(connection: Database) -> list[DecisionCheck]:
    initialize_rates(connection)
    row = connection.execute(
        """
        SELECT version, change_event FROM tariff_rate_versions
        WHERE change_id IS NOT NULL ORDER BY version DESC LIMIT 1
        """
    ).fetchone()
    if row is None:
        return []
    version, event = row
    change = ChangeEvent.model_validate(event)
    return [
        check_decision(connection, decision_id, change, version)
        for (decision_id,) in connection.execute(
            "SELECT decision_id FROM decisions WHERE type = 'supplier_award' ORDER BY decision_id"
        )
    ]


@router.get("/evidence/{supplier_id}/{part_no}", operation_id="evidence")
def evidence(supplier_id: str, part_no: str, connection: Database) -> EvidenceStatus:
    if connection.execute(
        "SELECT 1 FROM supplier_parts WHERE supplier_id = %s AND part_no = %s", (supplier_id, part_no),
    ).fetchone() is None:
        raise HTTPException(404, "Supplier part not found")
    initialize_store(connection)
    return evidence_status(connection, supplier_id, part_no, date.today())


@router.get("/actions", operation_id="actions")
def actions(connection: Database) -> list[Action]:
    initialize_store(connection)
    records = [
        Action.model_validate(payload)
        for (payload,) in connection.execute(
            """
            SELECT p.payload FROM proposed_actions p
            WHERE NOT EXISTS (SELECT 1 FROM sent_actions s WHERE s.action_id = p.id)
            """
        )
    ]
    return sorted(records, key=lambda action: (action.rank, action.id))


@router.post("/actions/{id}/send", operation_id="send_action")
def send_action(id: str, request: SendActionRequest, connection: Database) -> SendActionResponse:
    initialize_store(connection)
    if connection.execute("SELECT 1 FROM proposed_actions WHERE id = %s", (id,)).fetchone() is None:
        raise HTTPException(404, "Action not found")
    sent = connection.execute(
        "SELECT decision_number, draft_email, audit_id FROM sent_actions WHERE action_id = %s", (id,),
    ).fetchone()
    if sent is not None:
        number, original_email, audit_id = sent
        if request.draft_email != original_email:
            raise HTTPException(409, "Action already submitted with a different draft")
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(f"SELECT {FIELDS} FROM audit_events WHERE id = %s", (audit_id,))
            event = event_from_row(cursor.fetchone())
    else:
        event = append_event(connection, actor="demo-user", type="action_sent", entity_id=id)
        number = connection.execute(
            "INSERT INTO sent_actions (action_id, draft_email, audit_id) VALUES (%s, %s, %s) "
            "RETURNING decision_number",
            (id, request.draft_email, event.id),
        ).fetchone()[0]
    return SendActionResponse(
        audit_event=event, decision_id=f"D-2026-{number:03d}",
        state="pending_approval", pending_approvals=list(APPROVERS),
    )


@router.get("/audit", operation_id="audit")
def audit(connection: Database) -> list[AuditEvent]:
    return list_events(connection)
