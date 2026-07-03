from fastapi import APIRouter, Depends
from pydantic import BaseModel

from backend.config import settings
from backend.models.schemas import InterceptionRequest, Outcome, RiskLevel
from backend.services.policy_engine import PolicyEngine
from backend.services.semantic_guard import SemanticGuard
from backend.services.risk_classifier import RiskClassifier

from backend.api.auth import require_role, STAFF

router = APIRouter(dependencies=[Depends(require_role(STAFF))])

_engine = PolicyEngine()
_guard = SemanticGuard()
_classifier = RiskClassifier()


class DryRunResponse(BaseModel):
    policy_outcome: str
    policy_rule: str | None
    policy_reason: str
    semantic_blocked: bool
    semantic_threat: str
    semantic_confidence: float
    risk_level: str
    risk_score: float
    risk_factors: list[str]
    would_require_approval: bool


@router.post("/dryrun", response_model=DryRunResponse)
async def dry_run(request: InterceptionRequest):
    """Test against all layers without logging or approvals - what-if only."""
    if not _engine.rules:
        try:
            _engine.load_from_yaml(settings.policy_config_path)
        except FileNotFoundError:
            pass

    content = request.payload.get("input", "") or request.payload.get("content", "") or ""
    if content or request.action_type == "prompt_content":
        guard_result = _guard.evaluate(content or str(request.payload))
    else:
        guard_result = _guard.evaluate("")

    outcome, rule_id, risk, reason = _engine.evaluate(request)
    risk_assessment = _classifier.classify(request)

    # guard wins
    if guard_result.blocked:
        outcome = Outcome.deny
        rule_id = "SEMANTIC-GUARD"
        reason = f"Semantic guardrail: {guard_result.threat_type} ({guard_result.confidence:.0%})"

    # print("dryrun", outcome, rule_id)
    return DryRunResponse(
        policy_outcome=outcome.value,
        policy_rule=rule_id,
        policy_reason=reason,
        semantic_blocked=guard_result.blocked,
        semantic_threat=guard_result.threat_type,
        semantic_confidence=guard_result.confidence,
        risk_level=risk_assessment.level.value,
        risk_score=risk_assessment.score,
        risk_factors=risk_assessment.factors,
        would_require_approval=(outcome == Outcome.escalate),
    )
