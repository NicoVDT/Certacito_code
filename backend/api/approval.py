from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from backend.models.database import get_db
from backend.services.approval_service import ApprovalService
from backend.api.auth import get_current_user, require_role, STAFF

router = APIRouter()


class ReviewAction(BaseModel):
    reviewer: str


@router.get("/approvals")
async def get_pending_approvals(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    """get all pending approval items (auto-expires past SLA)"""
    svc = ApprovalService(db)
    items = await svc.get_pending()
    return [
        {
            "id": i.id,
            "agent_id": i.agent_id,
            "action_type": i.action_type,
            "action_desc": i.action_desc,
            "risk_level": i.risk_level,
            "policy_rule": i.policy_rule,
            "created_at": i.created_at.isoformat() if i.created_at else None,
            "sla_deadline": i.sla_deadline.isoformat() if i.sla_deadline else None,
            "status": i.status,
        }
        for i in items
    ]


@router.post("/approvals/{item_id}/approve")
async def approve_item(
    item_id: str,
    body: ReviewAction = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(STAFF)),
):
    # reviewer comes from the authed token so it can't be spoofed in the body
    svc = ApprovalService(db)
    item = await svc.approve(item_id, user.email)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found or already reviewed")
    return {"status": "approved", "id": item.id, "reviewer": user.email}


@router.post("/approvals/{item_id}/deny")
async def deny_item(
    item_id: str,
    body: ReviewAction = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(STAFF)),
):
    svc = ApprovalService(db)
    item = await svc.deny(item_id, user.email)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found or already reviewed")
    # print(f"[debug] denied {item_id} by {user.email}")
    return {"status": "denied", "id": item.id, "reviewer": user.email}
