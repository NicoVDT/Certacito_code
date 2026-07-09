from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date
from datetime import datetime, timezone, timedelta

from backend.models.database import get_db
from backend.models.tables import AuditLog

from backend.api.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/stats/trends")
async def get_trends(db: AsyncSession = Depends(get_db)):
    # daily decision counts for the last 7 days + top policy violations
    # with real hit counts
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    # daily counts for chart
    daily = []
    for i in range(7):
        day_start = (now - timedelta(days=6-i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        total_r = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= day_start)
            .where(AuditLog.timestamp < day_end)
        )
        blocked_r = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= day_start)
            .where(AuditLog.timestamp < day_end)
            .where(AuditLog.outcome == "DENY")
        )

        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        day_name = days[day_start.weekday()]

        daily.append({
            "day": day_name,
            "decisions": total_r.scalar() or 0,
            "blocked": blocked_r.scalar() or 0,
        })

    # top policy violations (rules that triggered DENY most)
    violations_r = await db.execute(
        select(AuditLog.policy_rule, func.count(AuditLog.id).label("hits"))
        .where(AuditLog.timestamp >= week_ago)
        .where(AuditLog.outcome == "DENY")
        .where(AuditLog.policy_rule.isnot(None))
        .group_by(AuditLog.policy_rule)
        .order_by(func.count(AuditLog.id).desc())
        .limit(5)
    )
    violations = violations_r.all()

    # get the max hits for percentage calc
    max_hits = violations[0][1] if violations else 1

    # map rule IDs to readable names
    rule_names = {
        "RULE-001": "Data access scope",
        "RULE-002": "External API calls",
        "RULE-003": "File write escalation",
        "RULE-004": "Prompt injection",
        "RULE-005": "Tool invocation",
        "RULE-006": "External email send",
        "RULE-007": "Credential access",
        "RULE-008": "Database read",
        "SEMANTIC-GUARD": "Semantic guardrail",
    }

    top_violations = [
        {
            "rule": v[0],
            "name": rule_names.get(v[0], v[0]),
            "hits": v[1],
            "pct": round((v[1] / max_hits) * 100),
        }
        for v in violations
    ]

    # print(f"[debug] trends daily={len(daily)} violations={len(top_violations)}")
    return {
        "daily": daily,
        "top_violations": top_violations,
    }
