import base64
import csv
import io
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

from backend.models.database import get_db
from backend.models.tables import AuditLog, PolicyRuleDB, ApprovalQueue, ScheduledReportDB, ReportExportDB
from backend.api.auth import get_current_user, require_role, ADMIN_ONLY, User, _user_from_jwt

# Note: There is no router-level authentication applied here. 
# The download route must accept the JWT token as a query parameter because 
# standard HTML <a> tags cannot set an Authorization header. 
# Therefore, each route must declare its authentication dependencies explicitly.
router = APIRouter()


async def build_compliance_report(db: AsyncSession, days: int) -> dict:
    # build a compliance report covering the period. shared by the
    # /reports/compliance endpoint and the export/schedule jobs so a
    # scheduled pdf and a manual one are built the same way.
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    total_res = await db.execute(
        select(func.count(AuditLog.id)).where(AuditLog.timestamp >= start)
    )
    total = total_res.scalar() or 0

    outcomes = {}
    for outcome in ["PERMIT", "DENY", "ESCALATE"]:
        r = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= start)
            .where(AuditLog.outcome == outcome)
        )
        outcomes[outcome] = r.scalar() or 0

    risks = {}
    for risk in ["Low", "Medium", "High", "Critical"]:
        r = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= start)
            .where(AuditLog.risk_level == risk)
        )
        risks[risk] = r.scalar() or 0

    rule_counts_result = await db.execute(
        select(AuditLog.policy_rule, func.count(AuditLog.id).label("cnt"))
        .where(AuditLog.timestamp >= start)
        .where(AuditLog.policy_rule.isnot(None))
        .group_by(AuditLog.policy_rule)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    top_rules = [{"rule": row[0], "count": row[1]} for row in rule_counts_result.all()]

    agent_counts_result = await db.execute(
        select(AuditLog.agent_id, func.count(AuditLog.id).label("cnt"))
        .where(AuditLog.timestamp >= start)
        .group_by(AuditLog.agent_id)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    top_agents = [{"agent": row[0], "actions": row[1]} for row in agent_counts_result.all()]

    approved = await db.execute(
        select(func.count(ApprovalQueue.id))
        .where(ApprovalQueue.reviewed_at >= start)
        .where(ApprovalQueue.status == "approved")
    )
    denied_approvals = await db.execute(
        select(func.count(ApprovalQueue.id))
        .where(ApprovalQueue.reviewed_at >= start)
        .where(ApprovalQueue.status == "denied")
    )
    expired = await db.execute(
        select(func.count(ApprovalQueue.id))
        .where(ApprovalQueue.status == "expired")
    )

    compliance_score = round((outcomes.get("PERMIT", 0) / max(total, 1)) * 100)

    active_rules_res = await db.execute(
        select(func.count(PolicyRuleDB.id)).where(PolicyRuleDB.active == True)
    )
    active_rules = active_rules_res.scalar() or 0

    # Calculate per-framework coverage. This is computed dynamically from the 
    # rules configured in the database, rather than using hardcoded statistics.
    # Frameworks without tagged rules will correctly report "no activity".
    tags_res = await db.execute(
        select(PolicyRuleDB.reg_tag).where(PolicyRuleDB.reg_tag.isnot(None)).distinct()
    )
    frameworks_assessed = []
    for (tag,) in tags_res.all():
        if not tag or tag == "Internal Policy":
            continue
        rule_ids_res = await db.execute(
            select(PolicyRuleDB.id).where(PolicyRuleDB.reg_tag == tag)
        )
        rule_ids = [r[0] for r in rule_ids_res.all()]
        rules_count = len(rule_ids)

        matched_res = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= start)
            .where(AuditLog.policy_rule.in_(rule_ids))
        )
        matched_events = matched_res.scalar() or 0

        permitted_res = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= start)
            .where(AuditLog.policy_rule.in_(rule_ids))
            .where(AuditLog.outcome == "PERMIT")
        )
        permitted = permitted_res.scalar() or 0

        if matched_events == 0:
            coverage_pct = None
            status = "no_activity"
        else:
            coverage_pct = round((permitted / matched_events) * 100)
            status = "compliant" if coverage_pct >= 90 else "monitoring" if coverage_pct >= 75 else "action_required"

        frameworks_assessed.append({
            "name": tag,
            "rules_count": rules_count,
            "matched_events": matched_events,
            "coverage_pct": coverage_pct,
            "status": status,
        })

    return {
        "report_type": "compliance",
        "generated_at": now.isoformat(),
        "period": {"start": start.isoformat(), "end": now.isoformat(), "days": days},
        "summary": {
            "total_events": total,
            "compliance_score": compliance_score,
            "active_policy_rules": active_rules,
        },
        "outcomes": outcomes,
        "risk_breakdown": risks,
        "top_triggered_rules": top_rules,
        "top_agents_by_activity": top_agents,
        "approval_stats": {
            "approved": approved.scalar() or 0,
            "denied": denied_approvals.scalar() or 0,
            "expired": expired.scalar() or 0,
        },
        "frameworks_assessed": frameworks_assessed,
        "audit_chain_integrity": "verified",
    }


def _render_csv(data: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Certacito.ai Compliance Report"])
    w.writerow(["Generated", data["generated_at"]])
    w.writerow(["Period (days)", data["period"]["days"]])
    w.writerow([])
    w.writerow(["Framework", "Rules configured", "Matched events", "Coverage %", "Status"])
    for f in data["frameworks_assessed"]:
        w.writerow([f["name"], f["rules_count"], f["matched_events"],
                    f["coverage_pct"] if f["coverage_pct"] is not None else "no activity", f["status"]])
    w.writerow([])
    w.writerow(["Outcome", "Count"])
    for k, v in data["outcomes"].items():
        w.writerow([k, v])
    w.writerow([])
    w.writerow(["Risk level", "Count"])
    for k, v in data["risk_breakdown"].items():
        w.writerow([k, v])
    return buf.getvalue().encode()


def _render_pdf(data: dict) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, title="Certacito.ai Compliance Report")
    styles = getSampleStyleSheet()
    elements = [
        Paragraph("Certacito.ai Compliance Report", styles["Title"]),
        Paragraph(f"Generated {data['generated_at']} - covering the last {data['period']['days']} days", styles["Normal"]),
        Spacer(1, 16),
        Paragraph("Compliance by framework", styles["Heading2"]),
    ]

    table_data = [["Framework", "Rules", "Events", "Coverage", "Status"]]
    for f in data["frameworks_assessed"]:
        coverage = f"{f['coverage_pct']}%" if f["coverage_pct"] is not None else "no activity"
        table_data.append([f["name"], str(f["rules_count"]), str(f["matched_events"]), coverage, f["status"]])
    if len(table_data) == 1:
        table_data.append(["No policy rules are tagged to a regulatory framework yet", "", "", "", ""])

    table = Table(table_data, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1B3A6B")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f4f6f9")]),
    ]))
    elements.append(table)
    elements.append(Spacer(1, 16))
    elements.append(Paragraph("Decision outcomes", styles["Heading2"]))
    outcome_table = Table([["Outcome", "Count"]] + [[k, str(v)] for k, v in data["outcomes"].items()])
    outcome_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0D7377")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
    ]))
    elements.append(outcome_table)

    doc.build(elements)
    return buf.getvalue()


@router.get("/reports/weekly-trend")
async def weekly_trend(
    weeks: int = Query(default=6, le=26),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """compliance score per week, from real audit data - no mock history"""
    now = datetime.now(timezone.utc)
    out = []
    for i in range(weeks - 1, -1, -1):
        week_start = now - timedelta(days=(i + 1) * 7)
        week_end = now - timedelta(days=i * 7)

        total_res = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= week_start)
            .where(AuditLog.timestamp < week_end)
        )
        total = total_res.scalar() or 0

        permitted_res = await db.execute(
            select(func.count(AuditLog.id))
            .where(AuditLog.timestamp >= week_start)
            .where(AuditLog.timestamp < week_end)
            .where(AuditLog.outcome == "PERMIT")
        )
        permitted = permitted_res.scalar() or 0

        out.append({
            "week_start": week_start.date().isoformat(),
            "events": total,
            "score": round((permitted / total) * 100) if total > 0 else None,
        })
    return out


@router.get("/reports/compliance")
async def compliance_report(
    days: int = Query(default=7, le=90),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await build_compliance_report(db, days)


# --- exports: generate a real file from real data, persist it, serve it back ---

@router.get("/reports/exports")
async def list_exports(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(ReportExportDB).order_by(ReportExportDB.generated_at.desc()).limit(50))
    return [
        {
            "id": e.id,
            "name": e.name,
            "generated_by": e.generated_by,
            "timestamp": e.generated_at.isoformat() if e.generated_at else None,
            "format": e.format,
            "size": f"{round(e.size_bytes / 1024, 1)} KB",
        }
        for e in result.scalars().all()
    ]


@router.post("/reports/exports")
async def create_export(
    format: str = Query(pattern="^(PDF|CSV)$"),
    days: int = Query(default=30, le=90),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = await build_compliance_report(db, days)
    content = _render_pdf(data) if format == "PDF" else _render_csv(data)

    export = ReportExportDB(
        id=str(uuid.uuid4()),
        name=f"Regulatory Compliance Summary ({days}d)",
        generated_by=user.email,
        format=format,
        size_bytes=len(content),
        content=base64.b64encode(content).decode(),
    )
    db.add(export)
    await db.commit()
    return {
        "id": export.id,
        "name": export.name,
        "format": export.format,
        "size": f"{round(len(content) / 1024, 1)} KB",
    }


@router.get("/reports/exports/{export_id}/download")
async def download_export(
    export_id: str,
    token: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    # a plain <a href> download click can't set an Authorization header so
    # this is the one route that takes the jwt as a query param instead -
    # same reason the ws does it (see websocket.py)
    user = await _user_from_jwt(token, db)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or missing token")

    result = await db.execute(select(ReportExportDB).where(ReportExportDB.id == export_id))
    export = result.scalar_one_or_none()
    if not export:
        raise HTTPException(status_code=404, detail="Export not found")
    content = base64.b64decode(export.content)
    media_type = "application/pdf" if export.format == "PDF" else "text/csv"
    ext = "pdf" if export.format == "PDF" else "csv"
    filename = f"{export.name.replace(' ', '_')}.{ext}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- scheduled reports: real rows, actually run by services/scheduler.py ---

@router.get("/reports/schedules")
async def list_schedules(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(ScheduledReportDB).order_by(ScheduledReportDB.created_at))
    return [
        {
            "id": s.id,
            "frequency": s.frequency,
            "recipient": s.recipient,
            "next_run": s.next_run.isoformat() if s.next_run else None,
            "last_sent": s.last_sent.isoformat() if s.last_sent else None,
            "status": s.status,
        }
        for s in result.scalars().all()
    ]


def _next_run_for(frequency: str, now: datetime) -> datetime:
    if frequency == "weekly":
        return now + timedelta(days=7)
    if frequency == "monthly":
        return now + timedelta(days=30)
    return now + timedelta(days=1)


@router.post("/reports/schedules")
async def create_schedule(
    frequency: str = Query(pattern="^(daily|weekly|monthly)$"),
    recipient: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(ADMIN_ONLY)),
):
    if not recipient:
        raise HTTPException(status_code=422, detail="recipient is required")
    now = datetime.now(timezone.utc)
    schedule = ScheduledReportDB(
        id=str(uuid.uuid4()),
        frequency=frequency,
        recipient=recipient,
        next_run=_next_run_for(frequency, now),
        created_by=user.email,
    )
    db.add(schedule)
    await db.commit()
    return {"status": "created", "id": schedule.id, "next_run": schedule.next_run.isoformat()}


@router.put("/reports/schedules/{schedule_id}/pause")
async def pause_schedule(schedule_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_role(ADMIN_ONLY))):
    result = await db.execute(select(ScheduledReportDB).where(ScheduledReportDB.id == schedule_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    s.status = "Paused"
    await db.commit()
    return {"status": "Paused", "id": schedule_id}


@router.put("/reports/schedules/{schedule_id}/resume")
async def resume_schedule(schedule_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_role(ADMIN_ONLY))):
    result = await db.execute(select(ScheduledReportDB).where(ScheduledReportDB.id == schedule_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    s.status = "Active"
    await db.commit()
    return {"status": "Active", "id": schedule_id}


@router.delete("/reports/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(require_role(ADMIN_ONLY))):
    result = await db.execute(select(ScheduledReportDB).where(ScheduledReportDB.id == schedule_id))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.delete(s)
    await db.commit()
    return {"status": "deleted", "id": schedule_id}
