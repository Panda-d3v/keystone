"""Persist approved A1/A2/A3 intake results and their processing audit events."""

from datetime import date
from typing import Annotated
from urllib.parse import quote

from fastapi import File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel

from api.agents.a4_match import EntityMatcher
from api.agents.llm import CacheMiss
from api.agents.pipeline import AgentPipeline
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


class DocumentReview(BaseModel):
    doc_id: str
    summary: str
    review: list[str]


class IntakeResponse(BaseModel):
    documents: list[DocEnvelope]
    change_ids: list[str]
    review_doc_ids: list[str]
    evidence_doc_ids: list[str]
    document_reviews: list[DocumentReview]


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
def intake(
    connection: Database,
    file: Annotated[UploadFile, File()],
    supplier_id: Annotated[str | None, Form()] = None,
    part_no: Annotated[str | None, Form()] = None,
) -> IntakeResponse:
    try:
        if bool(supplier_id) != bool(part_no):
            raise HTTPException(422, "Enter both the supplier ID and part number.")
        confirmed = (supplier_id.strip(), part_no.strip()) if supplier_id and part_no else None
        if confirmed and (
            not all(confirmed) or not connection.execute(
                "SELECT 1 FROM supplier_parts WHERE supplier_id = %s AND part_no = %s", confirmed,
            ).fetchone()
        ):
            raise HTTPException(422, "That supplier and part do not match an existing quote.")
        return process_upload(connection, file, confirmed)
    except CacheMiss as exc:
        raise HTTPException(503, "Replay data is missing for this document") from exc


def process_upload(
    connection: Database, file: UploadFile, confirmed: tuple[str, str] | None = None,
) -> IntakeResponse:
    content = file.file.read(MAX_UPLOAD + 1)
    if len(content) > MAX_UPLOAD:
        raise HTTPException(413, "Document exceeds the 20 MiB upload limit")
    if not content or not file.filename:
        raise HTTPException(422, "A named, nonempty document is required")
    pipeline = AgentPipeline(EntityMatcher.from_connection(connection))
    outcomes = pipeline.ingest(content, file.filename)
    extracted = []
    supplier_documents = []
    reviews = []
    for outcome in outcomes:
        envelope = outcome.intake.envelope
        review = list(outcome.review)
        if outcome.change is not None and not outcome.needs_review and not outcome.intake.needs_review:
            extracted.append((envelope, outcome.change))
        elif outcome.intake.needs_review and not review:
            review.append("Please confirm the document type.")
        if outcome.evidence:
            evidence = []
            for row in outcome.evidence:
                if row.kind not in {"mill_certificate", "origin_declaration"}:
                    continue
                if confirmed:
                    supplier, part = confirmed
                    if ((row.supplier_id and row.supplier_id != supplier)
                            or (row.part_no and row.part_no != part)):
                        raise HTTPException(409, "The document identifies a different supplier or part.")
                    fields = {**row.fields, "association_confirmed_by_operator": True}
                    row = row.model_copy(update={"supplier_id": supplier, "part_no": part, "fields": fields})
                if connection.execute(
                    "SELECT 1 FROM supplier_parts WHERE supplier_id = %s AND part_no = %s",
                    (row.supplier_id, row.part_no),
                ).fetchone() is not None:
                    evidence.append(row)
            if evidence:
                supplier_documents.append((envelope, evidence))
            else:
                review.append("The supplier and part could not be linked to an existing supplier quote.")
        reviews.append(DocumentReview(doc_id=envelope.doc_id, summary=outcome.summary, review=review))

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
            if confirmed and connection.execute(
                "SELECT 1 FROM evidence_records WHERE doc_id = %s "
                "AND (supplier_id <> %s OR part_no <> %s)",
                (envelope.doc_id, *confirmed),
            ).fetchone():
                raise HTTPException(409, "This document is already linked to a different supplier or part.")
        else:
            connection.execute(
                "INSERT INTO supplier_document_intake VALUES (%s, %s)", (envelope.doc_id, envelope.sha256),
            )
            for item in items:
                save_evidence(connection, item)
            if any(item.fields.get("association_confirmed_by_operator") is True for item in items):
                journal.append(("demo-user", "evidence_association_confirmed", envelope.doc_id))
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
    for outcome in outcomes:
        item = outcome.intake
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
        documents=[outcome.intake.envelope for outcome in outcomes],
        change_ids=change_ids,
        review_doc_ids=[item.doc_id for item in reviews if item.review],
        evidence_doc_ids=evidence_doc_ids,
        document_reviews=reviews,
    )
