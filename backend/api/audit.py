from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.database import get_db
from backend.services.audit import AuditService

from backend.api.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/audit")
async def get_audit_log(
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    svc = AuditService(db)
    entries = await svc.get_entries(limit=limit, offset=offset)
    return [
        {
            "id": e.id,
            "timestamp": e.timestamp.isoformat() if e.timestamp else None,
            "agent_id": e.agent_id,
            "action_type": e.action_type,
            "policy_rule": e.policy_rule,
            "policy_desc": e.policy_desc,
            "risk_level": e.risk_level,
            "outcome": e.outcome,
            "payload_hash": e.payload_hash,
            "payload_masked": e.payload_masked,
            "prev_hash": e.prev_hash,
            "entry_hash": e.entry_hash,
            "session_id": e.session_id,
        }
        for e in entries
    ]


@router.get("/audit/verify")
async def verify_audit_chain(
    db: AsyncSession = Depends(get_db),
):
    """check the hash chain integrity of the audit log"""
    svc = AuditService(db)
    # walks the whole log from genesis, not just the last page of it - checking
    # a window that doesn't start at genesis can't tell you the chain is intact
    valid, checked, bad_id = await svc.verify_full_chain()
    return {"chain_valid": valid, "entries_checked": checked, "first_bad_entry": bad_id}
