import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from contracts import models

ROOT = Path(__file__).resolve().parents[1] / "contracts"
RESPONSES = {
    "changes": list[models.ChangeEvent],
    "exposure": models.Exposure,
    "lineage": models.ExposureLineage,
    "decisions": list[models.DecisionCheck],
    "evidence": models.EvidenceStatus,
    "actions": list[models.Action],
    "intake_documents": list[models.IntakeDocument],
    "send_action": models.SendActionResponse,
    "decline_action": models.DeclineActionResponse,
    "audit": list[models.AuditEvent],
}


@pytest.mark.parametrize("name, model", RESPONSES.items())
def test_endpoint_fixture(name, model):
    TypeAdapter(model).validate_json((ROOT / "fixtures" / f"{name}.json").read_text())


def test_openapi_examples_match_fixtures():
    spec = json.loads((ROOT / "openapi.yaml").read_text())
    operations = [operation for path in spec["paths"].values() for operation in path.values()]
    assert {operation["operationId"] for operation in operations} == set(RESPONSES)
    for operation in operations:
        response = operation["responses"]["200"]["content"]["application/json"]
        name = operation["operationId"]
        assert response["example"] == json.loads((ROOT / "fixtures" / f"{name}.json").read_text())


def test_demo_exposure_totals_match_affected_lines():
    exposure = models.Exposure.model_validate_json((ROOT / "fixtures" / "exposure.json").read_text())
    assert exposure.open_po_lines == len(exposure.lines) == 33
    assert exposure.affected_parts == len({line.part_no for line in exposure.lines}) == 33
    assert exposure.added_duty_usd == round(sum(line.added_duty_usd for line in exposure.lines))
    assert exposure.annualized_added_duty_usd == 617061


def test_send_request_fixture():
    sample = json.loads((ROOT / "fixtures" / "send_action_request.json").read_text())
    models.SendActionRequest.model_validate(sample)
    spec = json.loads((ROOT / "openapi.yaml").read_text())
    request = spec["paths"]["/actions/{id}/send"]["post"]["requestBody"]
    assert request["required"]
    assert request["content"]["application/json"]["example"] == sample
    with pytest.raises(ValueError):
        models.SendActionRequest(draft_email=" ")


def test_demo_audit_matches_live_hash_chain():
    from api.audit.log import event_hash

    events = TypeAdapter(list[models.AuditEvent]).validate_json(
        (ROOT / "fixtures" / "audit.json").read_text()
    )
    previous = None
    for event in reversed(events):
        assert event.previous_hash == previous
        assert event.hash == event_hash(event)
        previous = event.hash
    send = models.SendActionResponse.model_validate_json(
        (ROOT / "fixtures" / "send_action.json").read_text()
    )
    assert send.audit_event == events[0]


def test_sheffield_fixture_has_the_five_rule_results():
    evidence = models.EvidenceStatus.model_validate_json(
        (ROOT / "fixtures" / "evidence.json").read_text()
    )
    assert [row.status for row in evidence.requirements] == [
        "checked", "checked", "checked", "needs_review", "missing",
    ]
    melt = next(row for row in evidence.requirements if row.id == "EV-UK-01")
    assert melt.reason and melt.citations
