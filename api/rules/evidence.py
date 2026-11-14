"""Evaluate the five evidence requirements for the demo UK duty tier."""

from collections.abc import Callable, Sequence
from datetime import date

from contracts.models import EvidenceItem, EvidenceRequirement, EvidenceStatus

MIN_CONFIDENCE = 0.85
UK_NAMES = {"gb", "uk", "united kingdom"}


def is_uk(value: str) -> bool:
    return value.strip().casefold().split(",")[-1].strip() in UK_NAMES


def check_uk_evidence(
    supplier_id: str,
    part_no: str,
    batch_ids: set[str],
    items: Sequence[EvidenceItem],
    on_date: date,
) -> EvidenceStatus:
    supplier_items = [item for item in items if item.supplier_id == supplier_id]
    certificates = [item for item in supplier_items if item.kind == "mill_certificate"]
    matched = [item for item in certificates if item.part_no == part_no]
    by_batch = {batch: [item for item in matched if item.batch_id == batch] for batch in sorted(batch_ids)}

    def requirement(
        identifier: str,
        label: str,
        candidates: Sequence[EvidenceItem],
        field: str,
        matches: Callable[[str], bool],
    ) -> EvidenceRequirement:
        row = EvidenceRequirement(id=identifier, label=label, status="missing")
        if not candidates:
            row.reason = f"No matching evidence for {label.lower()}."
            return row

        row.status = "checked"
        for item in candidates:
            row.citations.extend(item.field_citations.get(field) or item.bbox_refs)
            value = getattr(item, field, item.fields.get(field))
            expiry = item.fields.get("expires_on")
            try:
                expired = expiry is not None and date.fromisoformat(str(expiry)) < on_date
            except ValueError:
                row.status = "needs_review"
                row.reason = "The expiry date is unreadable."
                break
            if expired:
                row.status = "mismatch"
                row.reason = "The evidence has expired."
                break
            confidence = item.fields.get(f"{field}_confidence", item.confidence)
            if (
                not isinstance(value, str) or not value.strip()
                or type(confidence) not in (int, float)
                or not MIN_CONFIDENCE <= confidence <= 1
            ):
                row.status = "needs_review"
                row.reason = f"{label} is unreadable or below {MIN_CONFIDENCE:.0%} confidence."
                break
            if not matches(value):
                row.status = "mismatch"
                row.reason = f"The documented {label.lower()} does not match the requirement."
                break
        return row

    complete_batches = bool(by_batch) and all(by_batch.values())
    batch_items = [item for candidates in by_batch.values() for item in candidates]
    rows = [
        requirement("part-number", "Part number", matched or certificates, "part_no", lambda v: v == part_no),
        requirement("heat-batch", "Heat and batch", batch_items if complete_batches else [],
                    "batch_id", lambda v: v in batch_ids),
        requirement("certificate-origin", "Certificate country of origin", matched, "country_of_origin", is_uk),
        requirement("EV-UK-01", "UK melt and pour", batch_items if complete_batches else matched,
                    "melt_location", is_uk),
        requirement(
            "origin-declaration", "Origin declaration",
            [item for item in supplier_items if item.kind == "origin_declaration" and item.part_no == part_no],
            "country_of_origin", is_uk,
        ),
    ]
    missing = [row.label for row in rows if row.status != "checked"]
    statuses = {row.status for row in rows}
    status = "verified" if not missing else "missing" if statuses <= {"checked", "missing"} else "needs_review"
    return EvidenceStatus(
        supplier_id=supplier_id, part_no=part_no, status=status,
        missing_requirements=missing, items=supplier_items, requirements=rows,
    )
