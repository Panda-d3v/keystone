import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter

from contracts import models

ROOT = Path(__file__).resolve().parents[1] / "contracts"
RESPONSES = {
    "changes": list[models.ChangeEvent],
    "exposure": models.Exposure,
    "decisions": list[models.DecisionCheck],
    "evidence": models.EvidenceStatus,
    "actions": list[models.Action],
    "send_action": models.SendActionResponse,
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
