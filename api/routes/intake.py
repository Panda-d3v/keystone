"""Persist approved A1/A2/A3 intake results and their processing audit events."""

from datetime import date
from typing import Annotated
from urllib.parse import quote

from fastapi import File, HTTPException, Response, UploadFile
from pydantic import BaseModel

from api.agents.a1_intake import route_bytes
from api.agents.a2_change import extract_change
from api.agents.a3_evidence import extract_evidence
from api.agents.a4_match import EntityMatcher
from api.agents.llm import CacheMiss
from api.audit.log import append_event
from api.rules.rates import apply_change
from contracts.models import DocEnvelope

from . import Database, evidence_status, router
from .action_drafts import refresh_evidence_requests
from .store import save_evidence

MAX_UPLOAD = 20 * 1024 * 1024
VIEWABLE_MEDIA = {"application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"}
SCHEMA = """
CREATE TABLE IF NOT EXISTS bulletin_intake (
    doc_id text PRIMARY KEY,
    sha256 text NOT NULL,
    change_number integer GENERATED ALWAYS AS IDENTITY (START WITH 7) UNIQUE
);
CREATE TABLE IF NOT EXISTS intake_documents (
    doc_id text PRIMARY KEY,
    filename text NOT NULL,
    media_type text NOT NULL,
    content bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_document_intake (
    doc_id text PRIMARY KEY,
    sha256 text NOT NULL
);
"""


class IntakeResponse(BaseModel):
    documents: list[DocEnvelope]
    change_ids: list[str]
    review_doc_ids: list[str]
    evidence_doc_ids: list[str]


@router.get("/documents/{doc_id}", operation_id="document_source")
def document_source(doc_id: str, connection: Database) -> Response:
    if not connection.execute("SELECT to_regclass('intake_documents')").fetchone()[0]:
        raise HTTPException(404, "Document not found")
    row = connection.execute(
        "SELECT filename, media_type, content FROM intake_documents WHERE doc_id = %s",
        (doc_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Document not found")
    filename, media_type, content = row
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(filename, safe='')}",
            "Content-Security-Policy": "sandbox",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/intake", operation_id="intake")
def intake(connection: Database, file: Annotated[UploadFile, File()]) -> IntakeResponse:
    try:
        return process_upload(connection, file)
    except CacheMiss as exc:
        raise HTTPException(503, "Replay data is missing for this document") from exc


def process_upload(connection: Database, file: UploadFile) -> IntakeResponse:
    content = file.file.read(MAX_UPLOAD + 1)
    if len(content) > MAX_UPLOAD:
        raise HTTPException(413, "Document exceeds the 20 MiB upload limit")
    if not content or not file.filename:
        raise HTTPException(422, "A named, nonempty document is required")
    results = route_bytes(content, file.filename)
    extracted = []
    supplier_documents = []
    review = []
    for item in results:
        envelope = item.envelope
        if item.needs_review or envelope.kind == "unknown":
            review.append(envelope.doc_id)
        elif envelope.kind == "bulletin" and envelope.media_type == "application/pdf":
            extraction = extract_change(item, change_id="unassigned")
            if extraction.change is None or extraction.needs_review:
                review.append(envelope.doc_id)
            else:
                extracted.append((envelope, extraction.change))
        elif envelope.kind == "supplier_document":
            matcher = EntityMatcher.from_connection(connection)
            extraction = extract_evidence(item, resolve_supplier=matcher.resolver())
            evidence = []
            for row in extraction.items:
                part = matcher.match_part(row.part_no).match
                if row.kind not in {"mill_certificate", "origin_declaration"} or part is None:
                    continue
                if connection.execute(
                    "SELECT 1 FROM supplier_parts WHERE supplier_id = %s AND part_no = %s",
                    (row.supplier_id, part.entity_id),
                ).fetchone() is not None:
                    evidence.append(row.model_copy(update={"part_no": part.entity_id}))
            if evidence:
                supplier_documents.append((envelope, evidence))
            if not evidence or extraction.flags or extraction.low_confidence_fields:
                review.append(envelope.doc_id)

    change_ids = []
    evidence_doc_ids = []
    journal = []
    if extracted or supplier_documents:
        connection.execute("SELECT pg_advisory_xact_lock(2961202640)")
        connection.execute(SCHEMA)
    for envelope, change in extracted:
        previous = connection.execute(
            "SELECT sha256, change_number FROM bulletin_intake WHERE doc_id = %s",
            (envelope.doc_id,),
        ).fetchone()
        if previous is not None:
            sha256, number = previous
            if sha256 != envelope.sha256:
                raise HTTPException(409, "This document ID belongs to a different bulletin")
            change_ids.append(f"CE-{number:04d}")
            continue
        number = connection.execute(
            "INSERT INTO bulletin_intake (doc_id, sha256) VALUES (%s, %s) RETURNING change_number",
            (envelope.doc_id, envelope.sha256),
        ).fetchone()[0]
        change_id = f"CE-{number:04d}"
        apply_change(connection, change.model_copy(update={"id": change_id}))
        journal.extend([
            ("A1", "document_ingested", envelope.doc_id),
            ("A2", "change_extracted", change_id),
        ])
        change_ids.append(change_id)

    for envelope, items in supplier_documents:
        previous = connection.execute(
            "SELECT sha256 FROM supplier_document_intake WHERE doc_id = %s", (envelope.doc_id,),
        ).fetchone()
        if previous is not None:
            if previous[0] != envelope.sha256:
                raise HTTPException(409, "This document ID belongs to a different supplier document")
        else:
            connection.execute(
                "INSERT INTO supplier_document_intake VALUES (%s, %s)", (envelope.doc_id, envelope.sha256),
            )
            for item in items:
                save_evidence(connection, item)
            journal.extend([
                ("A1", "document_ingested", envelope.doc_id),
                ("A3", "evidence_extracted", envelope.doc_id),
            ])
            for supplier, part in sorted({(item.supplier_id, item.part_no) for item in items}):
                country = connection.execute(
                    "SELECT country_iso2 FROM suppliers WHERE supplier_id = %s", (supplier,),
                ).fetchone()
                if country != ("GB",):
                    continue
                status = evidence_status(connection, supplier, part, date.today())
                if any(row.status in {"needs_review", "mismatch"} for row in status.requirements):
                    journal.append(("T14", "evidence_refused", envelope.doc_id))
        evidence_doc_ids.append(envelope.doc_id)

    processed_ids = {
        envelope.doc_id for envelope, _ in extracted
    } | set(evidence_doc_ids)
    for item in results:
        envelope = item.envelope
        if envelope.doc_id in processed_ids and envelope.media_type in VIEWABLE_MEDIA:
            connection.execute(
                "INSERT INTO intake_documents VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (envelope.doc_id, envelope.filename, envelope.media_type, item.content),
            )

    if journal:
        journal.extend(("A5", "action_drafted", action_id)
                       for action_id in refresh_evidence_requests(connection))

    for actor, kind, entity_id in journal:
        append_event(connection, actor=actor, type=kind, entity_id=entity_id)

    return IntakeResponse(
        documents=[item.envelope for item in results],
        change_ids=change_ids,
        review_doc_ids=review,
        evidence_doc_ids=evidence_doc_ids,
    )
