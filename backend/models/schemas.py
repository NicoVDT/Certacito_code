from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from enum import Enum


class RiskLevel(str, Enum):
    low = "Low"
    medium = "Medium"
    high = "High"
    critical = "Critical"


class Outcome(str, Enum):
    permit = "PERMIT"
    deny = "DENY"
    escalate = "ESCALATE"


class Role(str, Enum):
    admin = "Administrator"
    analyst = "Analyst"
    viewer = "Viewer"


# what comes in from the agent when it tries to do something
class InterceptionRequest(BaseModel):
    agent_id: str
    action_type: str  # eg data_access, tool_invoke, email_send
    payload: dict = Field(default_factory=dict)
    session_id: Optional[str] = None
    timestamp: Optional[datetime] = None


# what we send back after policy eval
class InterceptionResponse(BaseModel):
    decision_id: str
    outcome: Outcome
    matched_rule: Optional[str] = None
    risk_level: RiskLevel
    reason: str
    requires_approval: bool = False


class AuditEntry(BaseModel):
    id: str
    timestamp: datetime
    agent_id: str
    action_type: str
    policy_rule: Optional[str]
    risk_level: RiskLevel
    outcome: Outcome
    payload_hash: str  # sha256 of the request payload
    prev_hash: str  # hash chain - links to previous entry
    entry_hash: str  # hash of this entire record


class ApprovalItem(BaseModel):
    id: str
    agent_id: str
    action_type: str
    action_desc: str
    risk_level: RiskLevel
    policy_rule: str
    created_at: datetime
    sla_deadline: datetime
    status: Literal["pending", "approved", "denied", "expired"] = "pending"
    reviewer: Optional[str] = None


class PolicyRule(BaseModel):
    id: str
    name: str
    action_type: str
    risk_threshold: RiskLevel
    default_outcome: Outcome
    conditions: Optional[str] = None
    reg_tag: str  # which compliance framework
    active: bool = True
    version: int = 1


class UserCreate(BaseModel):
    email: str
    password: str
    role: Role = Role.viewer


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
