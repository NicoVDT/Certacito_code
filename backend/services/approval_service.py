import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from backend.models.tables import ApprovalQueue
from backend.models.schemas import RiskLevel
from backend.config import settings


class ApprovalService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_item(
        self,
        agent_id: str,
        action_type: str,
        action_desc: str,
        risk_level: RiskLevel,
        policy_rule: str,
    ) -> ApprovalQueue:
        now = datetime.now(timezone.utc)
        item = ApprovalQueue(
            id=f"APR-{uuid.uuid4().hex[:8].upper()}",
            agent_id=agent_id,
            action_type=action_type,
            action_desc=action_desc,
            risk_level=risk_level.value,
            policy_rule=policy_rule,
            created_at=now,
            sla_deadline=now + timedelta(seconds=settings.sla_timeout),
            status="pending",
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def get_pending(self) -> list[ApprovalQueue]:
        # expire anything thats past its SLA deadline before we return the list
        now = datetime.now(timezone.utc)
        await self.db.execute(
            update(ApprovalQueue)
            .where(ApprovalQueue.status == "pending")
            .where(ApprovalQueue.sla_deadline < now)
            .values(status="expired")
        )
        await self.db.commit()

        # print("[approval] fetching pending after expiry sweep")

        result = await self.db.execute(
            select(ApprovalQueue)
            .where(ApprovalQueue.status == "pending")
            .order_by(ApprovalQueue.created_at.desc())
        )
        return list(result.scalars().all())

    async def approve(self, item_id: str, reviewer: str) -> Optional[ApprovalQueue]:
        result = await self.db.execute(
            select(ApprovalQueue).where(ApprovalQueue.id == item_id)
        )
        item = result.scalar_one_or_none()
        if not item or item.status != "pending":
            return None

        item.status = "approved"
        item.reviewer = reviewer
        item.reviewed_at = datetime.now(timezone.utc)
        await self.db.commit()
        return item

    async def deny(self, item_id: str, reviewer: str) -> Optional[ApprovalQueue]:
        result = await self.db.execute(
            select(ApprovalQueue).where(ApprovalQueue.id == item_id)
        )
        item = result.scalar_one_or_none()
        if not item or item.status != "pending":
            return None

        # TODO: should denied items get a reason field? skip for now
        item.status = "denied"
        item.reviewer = reviewer
        item.reviewed_at = datetime.now(timezone.utc)
        await self.db.commit()
        return item
