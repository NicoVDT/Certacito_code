from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
import uuid

from backend.models.database import get_db
from backend.models.schemas import (
    InterceptionRequest,
    InterceptionResponse,
    Outcome,
    RiskLevel,
)
from backend.services.policy_engine import PolicyEngine
from backend.config import settings

router = APIRouter()

_engine = PolicyEngine()


def get_policy_engine() -> PolicyEngine:
    if not _engine.rules:
        try:
            _engine.load_from_yaml(settings.policy_config_path)
        except FileNotFoundError:
            pass
    return _engine


@router.post("/intercept", response_model=InterceptionResponse)
async def intercept_action(
    request: InterceptionRequest,
    db: AsyncSession = Depends(get_db),
):
    """Core governance decision - every agent tool call hits this first."""
    engine = get_policy_engine()

    try:
        outcome, rule_id, risk, reason = engine.evaluate(request)
    except Exception:
        outcome = Outcome.deny
        rule_id = None
        risk = RiskLevel.critical
        reason = "Policy engine error - denied by fail-closed principle"

    decision_id = f"DEC-{uuid.uuid4().hex[:8].upper()}"

    return InterceptionResponse(
        decision_id=decision_id,
        outcome=outcome,
        matched_rule=rule_id,
        risk_level=risk,
        reason=reason,
        requires_approval=False,
    )
