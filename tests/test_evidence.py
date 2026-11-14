from datetime import date

from api.rules.evidence import check_uk_evidence
from contracts.models import Citation, EvidenceItem


def test_sheffield_refuses_unreadable_melt_location_and_requires_origin_declaration():
    batches = {"SF-24117", "SF-24121"}
    citation = Citation(doc_id="sheffield", page=1, bbox=(0.10, 0.28, 0.65, 0.31))
    certificates = [
        EvidenceItem(
            supplier_id="S007", part_no="MF-8413-005", batch_id=batch,
            doc_id="sheffield", kind="mill_certificate", confidence=0.93,
            fields={"country_of_origin": "United Kingdom", "melt_location": None,
                    "melt_location_confidence": 0.42},
            bbox_refs=[], field_citations={"melt_location": [citation]},
        )
        for batch in sorted(batches)
    ]
    result = check_uk_evidence("S007", "MF-8413-005", batches, certificates, date(2026, 12, 1))
    assert result.status == "needs_review"
    assert [row.status for row in result.requirements] == [
        "checked", "checked", "checked", "needs_review", "missing",
    ]
    assert result.requirements[3].citations
    assert result.requirements[3].reason

    clean_certs = [
        certificate.model_copy(
            update={"fields": {"country_of_origin": "GB", "melt_location": "Sheffield, United Kingdom"}}
        )
        for certificate in certificates
    ]
    origin = EvidenceItem(
        supplier_id="S007", part_no="MF-8413-005", batch_id=None,
        doc_id="origin", kind="origin_declaration", confidence=0.9,
        fields={"country_of_origin": "GB"}, bbox_refs=[],
    )
    evidence = [*clean_certs, origin]
    assert check_uk_evidence("S007", "MF-8413-005", batches, evidence, date(2026, 12, 1)).status == "verified"
    assert check_uk_evidence(
        "S007", "MF-8413-005", batches | {"unproven"}, evidence, date(2026, 12, 1)
    ).status != "verified"
