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
from backend.services.audit import AuditService
from backend.services.approval_service import ApprovalService
from backend.services.semantic_guard import SemanticGuard
from backend.api.websocket import broadcast_event
from backend.api.auth import agent_or_user
from backend.api.agents import record_agent_activity
from backend.config import settings

router = APIRouter()

_engine = PolicyEngine()
_guard = SemanticGuard()


def get_policy_engine() -> PolicyEngine:
    # lazy load yaml
    if not _engine.rules:
        try:
            _engine.load_from_yaml(settings.policy_config_path)
        except FileNotFoundError:
            pass  # empty rules = deny everything
    return _engine


@router.post("/intercept", response_model=InterceptionResponse)
async def intercept_action(
    request: InterceptionRequest,
    db: AsyncSession = Depends(get_db),
    caller=Depends(agent_or_user),
):
    """Core governance decision - every agent tool call hits this first."""
    engine = get_policy_engine()

    guard_result = None
    content_to_check = request.payload.get("input", "") or request.payload.get("content", "") or request.payload.get("prompt", "")
    if content_to_check or request.action_type == "prompt_content":
        check_text = content_to_check or str(request.payload)
        guard_result = _guard.evaluate(check_text)
        if guard_result.blocked:
            # semantic guard wins, skip policy
            outcome = Outcome.deny
            rule_id = "SEMANTIC-GUARD"
            risk = RiskLevel.critical
            reason = f"Semantic guardrail triggered: {guard_result.threat_type} (confidence: {guard_result.confidence:.0%})"

            audit_svc = AuditService(db)
            await audit_svc.log_decision(
                agent_id=request.agent_id,
                action_type=request.action_type,
                policy_rule=rule_id,
                policy_desc=reason,
                risk_level=risk,
                outcome=outcome,
                payload=request.payload,
                session_id=request.session_id,
            )

            await record_agent_activity(db, request.agent_id, blocked=True)

            return InterceptionResponse(
                decision_id=f"DEC-{uuid.uuid4().hex[:8].upper()}",
                outcome=outcome,
                matched_rule=rule_id,
                risk_level=risk,
                reason=reason,
                requires_approval=False,
            )

    try:
        outcome, rule_id, risk, reason = engine.evaluate(request)
    except Exception:
        # fail-closed, fix later
        outcome = Outcome.deny
        rule_id = None
        risk = RiskLevel.critical
        reason = "Policy engine error - denied by fail-closed principle"

    requires_approval = False
    if outcome == Outcome.escalate:
        requires_approval = True
        approval_svc = ApprovalService(db)
        await approval_svc.create_item(
            agent_id=request.agent_id,
            action_type=request.action_type,
            action_desc=str(request.payload),
            risk_level=risk,
            policy_rule=rule_id or "UNKNOWN",
        )

    # always log
    audit_svc = AuditService(db)
    await audit_svc.log_decision(
        agent_id=request.agent_id,
        action_type=request.action_type,
        policy_rule=rule_id,
        policy_desc=reason,
        risk_level=risk,
        outcome=outcome,
        payload=request.payload,
        session_id=request.session_id,
    )

    # bump the registry counters. this was written months ago and never
    # actually wired up, so every agent sat on 0 actions / never seen
    await record_agent_activity(db, request.agent_id, blocked=(outcome == Outcome.deny))

    decision_id = f"DEC-{uuid.uuid4().hex[:8].upper()}"

    await broadcast_event({
        "type": "decision",
        "decision_id": decision_id,
        "agent_id": request.agent_id,
        "action_type": request.action_type,
        "outcome": outcome.value,
        "risk_level": risk.value,
        "matched_rule": rule_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return InterceptionResponse(
        decision_id=decision_id,
        outcome=outcome,
        matched_rule=rule_id,
        risk_level=risk,
        reason=reason,
        requires_approval=requires_approval,
    )
