from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

from backend.models.database import get_db
from backend.models.tables import AuditLog, ApprovalQueue, PolicyRuleDB

from backend.api.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/stats/dashboard")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    # aggregated stats for the dashboard KPI cards.
    # pulls from the last 24 hours by default
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)

    # total intercepted today
    total_result = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.timestamp >= day_ago)
    )
    total_intercepted = total_result.scalar() or 0

    # blocked (DENY outcomes)
    blocked_result = await db.execute(
        select(func.count(AuditLog.id))
        .where(AuditLog.timestamp >= day_ago)
        .where(AuditLog.outcome == "DENY")
    )
    blocked = blocked_result.scalar() or 0

    # critical events
    critical_result = await db.execute(
        select(func.count(AuditLog.id))
        .where(AuditLog.timestamp >= day_ago)
        .where(AuditLog.risk_level == "Critical")
    )
    critical_events = critical_result.scalar() or 0

    # pending approvals
    pending_result = await db.execute(
        select(func.count(ApprovalQueue.id))
        .where(ApprovalQueue.status == "pending")
    )
    pending_approvals = pending_result.scalar() or 0

    # active policy rules
    active_rules_result = await db.execute(
        select(func.count(PolicyRuleDB.id)).where(PolicyRuleDB.active == True)
    )
    active_rules = active_rules_result.scalar() or 0

    # outcome breakdown for donut chart
    outcomes = {}
    for outcome in ["PERMIT", "DENY", "ESCALATE"]:
        r = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= day_ago)
            .where(AuditLog.outcome == outcome)
        )
        outcomes[outcome] = r.scalar() or 0

    # risk breakdown
    risks = {}
    for risk in ["Low", "Medium", "High", "Critical"]:
        r = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= day_ago)
            .where(AuditLog.risk_level == risk)
        )
        risks[risk] = r.scalar() or 0

    # compliance score (simple calc: permits / total). null on a quiet day -
    # dividing by max(total,1) used to report 0% "needs attention" when nothing
    # had been intercepted at all, which reads as a failing system
    compliance = (
        round((outcomes.get("PERMIT", 0) / total_intercepted) * 100)
        if total_intercepted
        else None
    )

    # sla adherence: of the escalations a human actually actioned, how many
    # landed before their deadline. the dashboard used to hardcode this at 94%
    reviewed_result = await db.execute(
        select(func.count(ApprovalQueue.id)).where(ApprovalQueue.reviewed_at.isnot(None))
    )
    reviewed_total = reviewed_result.scalar() or 0

    on_time_result = await db.execute(
        select(func.count(ApprovalQueue.id))
        .where(ApprovalQueue.reviewed_at.isnot(None))
        .where(ApprovalQueue.reviewed_at <= ApprovalQueue.sla_deadline)
    )
    on_time = on_time_result.scalar() or 0
    sla_adherence = round((on_time / reviewed_total) * 100) if reviewed_total else None

    # print(f"[debug] dashboard total={total_intercepted} blocked={blocked}")
    return {
        "total_intercepted": total_intercepted,
        "blocked": blocked,
        "critical_events": critical_events,
        "pending_approvals": pending_approvals,
        "active_rules": active_rules,
        "compliance_score": compliance,
        "sla_adherence": sla_adherence,
        "reviewed_total": reviewed_total,
        "outcomes": outcomes,
        "risk_breakdown": risks,
    }
