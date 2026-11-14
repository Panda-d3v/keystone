"""Persist approved A1/A2 bulletin results and their processing audit events."""

from typing import Annotated

from fastapi import File, HTTPException, UploadFile
from pydantic import BaseModel

from api.agents.a1_intake import route_bytes
from api.agents.a2_change import extract_change
from api.audit.log import append_event
from api.rules.rates import apply_change
from contracts.models import DocEnvelope

from . import Database, router

MAX_UPLOAD = 20 * 1024 * 1024
SCHEMA = """
CREATE TABLE IF NOT EXISTS bulletin_intake (
    doc_id text PRIMARY KEY,
    sha256 text NOT NULL,
    change_number integer GENERATED ALWAYS AS IDENTITY (START WITH 7) UNIQUE
)
"""


class IntakeResponse(BaseModel):
    documents: list[DocEnvelope]
    change_ids: list[str]
    review_doc_ids: list[str]


@router.post("/intake", operation_id="intake")
def intake(connection: Database, file: Annotated[UploadFile, File()]) -> IntakeResponse:
    content = file.file.read(MAX_UPLOAD + 1)
    if len(content) > MAX_UPLOAD:
        raise HTTPException(413, "Document exceeds the 20 MiB upload limit")
    if not content or not file.filename:
        raise HTTPException(422, "A named, nonempty document is required")
    results = route_bytes(content, file.filename)
    extracted = []
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
            review.append(envelope.doc_id)

    change_ids = []
    if extracted:
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
        append_event(connection, actor="A1", type="document_ingested", entity_id=envelope.doc_id)
        append_event(connection, actor="A2", type="change_extracted", entity_id=change_id)
        change_ids.append(change_id)

    return IntakeResponse(
        documents=[item.envelope for item in results],
        change_ids=change_ids,
        review_doc_ids=review,
    )
