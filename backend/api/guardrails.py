from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.services.semantic_guard import SemanticGuard

from backend.api.auth import agent_or_user

router = APIRouter(dependencies=[Depends(agent_or_user)])
_guard = SemanticGuard()


class GuardCheckRequest(BaseModel):
    content: str


class GuardCheckResponse(BaseModel):
    blocked: bool
    threat_type: str
    confidence: float
    matched_pattern: str


@router.post("/guardrails/check", response_model=GuardCheckResponse)
async def check_content(body: GuardCheckRequest):
    """Check arbitrary content against semantic guardrails."""
    result = _guard.evaluate(body.content)
    return GuardCheckResponse(
        blocked=result.blocked,
        threat_type=result.threat_type,
        confidence=result.confidence,
        matched_pattern=result.matched_pattern,
    )


from backend.services.risk_classifier import RiskClassifier
from backend.models.schemas import InterceptionRequest

_classifier = RiskClassifier()


class RiskAssessmentResponse(BaseModel):
    level: str
    score: float
    factors: list[str]


@router.post("/risk/classify", response_model=RiskAssessmentResponse)
async def classify_risk(request: InterceptionRequest):
    """Risk level only, no interception. handy for testing."""
    assessment = _classifier.classify(request)
    return RiskAssessmentResponse(
        level=assessment.level.value,
        score=assessment.score,
        factors=assessment.factors,
    )
