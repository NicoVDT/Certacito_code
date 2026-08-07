from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime, timezone

from backend.models.database import get_db
from backend.models.tables import AgentDB
from backend.api.auth import get_current_user, require_role, ADMIN_ONLY, STAFF

router = APIRouter()

# the registry used to be a module level dict, so every restart of the api
# wiped whatever had been registered and put the seed back. it lives in
# postgres now like everything else.
#
# only real agents belong in here. there used to be four others - a claims
# agent, a support agent, a finance one and a suspended ops one - with made up
# models and registration dates, so the registry showed five agents when we
# have one. thats system state a marker can click into and it wasnt true.
# the simulator still emits under invented ids, which is fine, thats what a
# simulator is, but they dont get to appear here as registered agents.


def serialise(a: AgentDB) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "status": a.status,
        "model": a.model,
        "container": a.container,
        "registered_at": a.registered_at.isoformat() if a.registered_at else None,
        "last_seen": a.last_seen.isoformat() if a.last_seen else None,
        "permissions": a.permissions.split(",") if a.permissions else [],
        "total_actions": a.total_actions or 0,
        "blocked_actions": a.blocked_actions or 0,
    }


class AgentRegister(BaseModel):
    id: str
    name: str
    model: Optional[str] = None
    container: Optional[str] = None
    permissions: list[str] = []


@router.get("/agents")
async def list_agents(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    rows = (await db.execute(select(AgentDB).order_by(AgentDB.id))).scalars().all()
    return [serialise(a) for a in rows]


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    agent = await db.get(AgentDB, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return serialise(agent)


@router.post("/agents")
async def register_agent(
    body: AgentRegister,
    db: AsyncSession = Depends(get_db),
    user=Depends(require_role(ADMIN_ONLY)),
):
    if await db.get(AgentDB, body.id):
        raise HTTPException(status_code=409, detail="Agent ID already registered")

    db.add(AgentDB(
        id=body.id,
        name=body.name,
        status="active",
        model=body.model,
        container=body.container,
        registered_at=datetime.now(timezone.utc),
        permissions=",".join(body.permissions),
        total_actions=0,
        blocked_actions=0,
    ))
    await db.commit()
    return {"status": "registered", "id": body.id}


async def _set_status(db: AsyncSession, agent_id: str, status: str):
    agent = await db.get(AgentDB, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.status = status
    await db.commit()
    return {"status": status, "id": agent_id}


@router.put("/agents/{agent_id}/suspend")
async def suspend_agent(agent_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_role(STAFF))):
    return await _set_status(db, agent_id, "suspended")


@router.put("/agents/{agent_id}/activate")
async def activate_agent(agent_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_role(STAFF))):
    return await _set_status(db, agent_id, "active")


async def record_agent_activity(db: AsyncSession, agent_id: str, blocked: bool):
    # called from interception to bump the agent stats. unknown ids are
    # ignored on purpose - the simulator posts under invented ones and they
    # are not registered agents
    agent = await db.get(AgentDB, agent_id)
    if not agent:
        return
    agent.total_actions = (agent.total_actions or 0) + 1
    agent.last_seen = datetime.now(timezone.utc)
    if blocked:
        agent.blocked_actions = (agent.blocked_actions or 0) + 1
    await db.commit()
