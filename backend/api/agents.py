from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from backend.api.auth import get_current_user, require_role, ADMIN_ONLY, STAFF

router = APIRouter()

# in-memory agent registry for now
# TODO: move to database if we need persistence across restarts
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
    "AGT-claims-014": {
        "id": "AGT-claims-014",
        "name": "Claims Processing Agent",
        "status": "active",
        "model": "gpt-4",
        "container": "external",
        "registered_at": "2026-05-20T09:00:00Z",
        "last_seen": None,
        "permissions": ["data_access", "tool_invoke"],
        "total_actions": 0,
        "blocked_actions": 0,
    },
    "AGT-support-031": {
        "id": "AGT-support-031",
        "name": "Customer Support Agent",
        "status": "active",
        "model": "claude-sonnet",
        "container": "external",
        "registered_at": "2026-05-22T11:00:00Z",
        "last_seen": None,
        "permissions": ["prompt_content", "tool_invoke"],
        "total_actions": 0,
        "blocked_actions": 0,
    },
    "AGT-finance-004": {
        "id": "AGT-finance-004",
        "name": "Finance Automation Agent",
        "status": "active",
        "model": "gpt-4",
        "container": "external",
        "registered_at": "2026-05-18T14:00:00Z",
        "last_seen": None,
        "permissions": ["tool_invoke", "db_read", "external_call"],
        "total_actions": 0,
        "blocked_actions": 0,
    },
    "AGT-ops-009": {
        "id": "AGT-ops-009",
        "name": "Operations Agent",
        "status": "suspended",
        "model": "gpt-4",
        "container": "external",
        "registered_at": "2026-05-15T08:00:00Z",
        "last_seen": None,
        "permissions": ["file_write", "system_command"],
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
