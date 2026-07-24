from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from backend.api.auth import get_current_user, require_role, ADMIN_ONLY, STAFF

router = APIRouter()

# in-memory agent registry for now
# TODO: move to database if we need persistence across restarts
#
# only real agents belong in here. there used to be four others - a claims
# agent, a support agent, a finance one and a suspended ops one - with made up
# models and registration dates, so the registry showed five agents when we
# have one. thats system state a marker can click into and it wasn't true.
# the simulator still emits under mock ids, which is fine, thats what a
# simulator is, but they don't get to appear here as registered agents.
_agents: dict[str, dict] = {
    "AGT-openclaw-azure": {
        "id": "AGT-openclaw-azure",
        "name": "OpenClaw Governance Agent",
        "status": "active",
        "model": "google/gemini-2.5-pro",
        "container": "azure-vm",
        "registered_at": "2026-06-25T13:00:00Z",
        "last_seen": None,
        "permissions": ["tool_invoke", "data_access", "file_write", "db_read"],
        "total_actions": 0,
        "blocked_actions": 0,
    },
}


class AgentRegister(BaseModel):
    id: str
    name: str
    model: Optional[str] = None
    container: Optional[str] = None
    permissions: list[str] = []


@router.get("/agents")
async def list_agents(user=Depends(get_current_user)):
    return list(_agents.values())


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, user=Depends(get_current_user)):
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _agents[agent_id]


@router.post("/agents")
async def register_agent(body: AgentRegister, user=Depends(require_role(ADMIN_ONLY))):
    if body.id in _agents:
        raise HTTPException(status_code=409, detail="Agent ID already registered")
    _agents[body.id] = {
        "id": body.id,
        "name": body.name,
        "status": "active",
        "model": body.model,
        "container": body.container,
        "registered_at": datetime.now(timezone.utc).isoformat(),
        "last_seen": None,
        "permissions": body.permissions,
        "total_actions": 0,
        "blocked_actions": 0,
    }
    return {"status": "registered", "id": body.id}


@router.put("/agents/{agent_id}/suspend")
async def suspend_agent(agent_id: str, user=Depends(require_role(STAFF))):
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    _agents[agent_id]["status"] = "suspended"
    return {"status": "suspended", "id": agent_id}


@router.put("/agents/{agent_id}/activate")
async def activate_agent(agent_id: str, user=Depends(require_role(STAFF))):
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail="Agent not found")
    _agents[agent_id]["status"] = "active"
    return {"status": "active", "id": agent_id}


def record_agent_activity(agent_id: str, blocked: bool):
    # called from interception to bump the agent stats
    if agent_id in _agents:
        _agents[agent_id]["total_actions"] += 1
        _agents[agent_id]["last_seen"] = datetime.now(timezone.utc).isoformat()
        if blocked:
            _agents[agent_id]["blocked_actions"] += 1
