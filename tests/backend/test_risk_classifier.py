"""Tests for the risk classification engine."""
from backend.services.risk_classifier import RiskClassifier
from backend.models.schemas import InterceptionRequest, RiskLevel


def get_classifier():
    return RiskClassifier()


def test_credential_access_is_critical():
    c = get_classifier()
    req = InterceptionRequest(
        agent_id="AGT-test",
        action_type="credential_access",
        payload={"target": "admin_password"}
    )
    result = c.classify(req)
    assert result.level == RiskLevel.critical
    assert result.score >= 76


def test_db_read_is_low():
    c = get_classifier()
    req = InterceptionRequest(
        agent_id="AGT-test",
        action_type="db_read",
        payload={"table": "config"}
    )
    result = c.classify(req)
    assert result.level == RiskLevel.low
    assert result.score <= 25


def test_patient_data_bumps_risk():
    c = get_classifier()
    req = InterceptionRequest(
        agent_id="AGT-health",
        action_type="data_access",
        payload={"target": "patient_medical_record"}
    )
    result = c.classify(req)
    assert result.level in (RiskLevel.high, RiskLevel.critical)
    assert any("patient" in f for f in result.factors)


def test_tool_invoke_is_low():
    c = get_classifier()
    req = InterceptionRequest(
        agent_id="AGT-util",
        action_type="tool_invoke",
        payload={"tool": "calculator", "args": [1, 2]}
    )
    result = c.classify(req)
    assert result.level == RiskLevel.low
