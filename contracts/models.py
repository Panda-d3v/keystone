from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Probability = Annotated[float, Field(ge=0, le=1)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Citation(Contract):
    doc_id: str
    page: Annotated[int, Field(ge=1)]
    bbox: tuple[float, float, float, float]


class DocEnvelope(Contract):
    doc_id: str
    filename: str
    media_type: str
    sha256: Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
    kind: Literal["bulletin", "supplier_document", "unknown"]
    attachment_ids: list[str] = Field(default_factory=list)


class ChangeEvent(Contract):
    id: str
    measure: str
    hts_scope: list[str]
    countries: list[str]
    old_rate: Probability
    new_rate: Probability
    basis: str
    effective_date: date
    citations: list[Citation]


class EvidenceItem(Contract):
    supplier_id: str
    part_no: str
    batch_id: str | None
    doc_id: str
    kind: str
    fields: dict[str, str | int | float | bool | None]
    confidence: Probability
    bbox_refs: list[Citation]


class Match(Contract):
    entity_id: str
    score: Probability
    method: str


class ExposureLine(Contract):
    po_id: str
    line_no: int
    part_no: str
    supplier_id: str
    est_entry_date: date
    customs_value_usd: float
    added_duty_usd: float


class Exposure(Contract):
    change_id: str
    affected_parts: int
    open_po_lines: int
    added_duty_usd: float
    annualized_added_duty_usd: float
    lines: list[ExposureLine]


class DecisionCheck(Contract):
    decision_id: str
    change_id: str
    status: Literal["valid", "broken", "needs_review"]
    reason: str
    incumbent_annual_usd: float
    alternative_with_proof_annual_usd: float
    alternative_without_proof_annual_usd: float


class EvidenceStatus(Contract):
    supplier_id: str
    part_no: str
    status: Literal["verified", "missing", "needs_review"]
    missing_requirements: list[str]
    items: list[EvidenceItem]


class Action(Contract):
    id: str
    rank: int
    type: str
    part_ids: list[str]
    usd_at_stake: float
    draft_email: str


class AuditEvent(Contract):
    id: str
    occurred_at: datetime
    actor: str
    type: str
    entity_id: str
    previous_hash: str | None
    hash: str
