from sqlalchemy import Column, String, DateTime, Boolean, Integer, Text, Enum as SAEnum
from sqlalchemy.sql import func
from backend.models.database import Base
import enum


class RiskLevelDB(str, enum.Enum):
    Low = "Low"
    Medium = "Medium"
    High = "High"
    Critical = "Critical"


class OutcomeDB(str, enum.Enum):
    PERMIT = "PERMIT"
    DENY = "DENY"
    ESCALATE = "ESCALATE"


class RoleDB(str, enum.Enum):
    Administrator = "Administrator"
    Analyst = "Analyst"
    Viewer = "Viewer"


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(String, primary_key=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    agent_id = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    policy_rule = Column(String, nullable=True)
    policy_desc = Column(String, nullable=True)
    risk_level = Column(String, nullable=False)
    outcome = Column(String, nullable=False)
    payload_masked = Column(Text, nullable=True)  # PII-masked version of the payload
    payload_hash = Column(String, nullable=False)
    prev_hash = Column(String, nullable=False)
    entry_hash = Column(String, nullable=False)
    session_id = Column(String, nullable=True)


class ApprovalQueue(Base):
    __tablename__ = "approval_queue"

    id = Column(String, primary_key=True)
    agent_id = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    action_desc = Column(Text, nullable=True)
    risk_level = Column(String, nullable=False)
    policy_rule = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sla_deadline = Column(DateTime(timezone=True), nullable=False)
    status = Column(String, default="pending")
    reviewer = Column(String, nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    payload_masked = Column(Text, nullable=True)


class PolicyRuleDB(Base):
    __tablename__ = "policy_rules"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    action_type = Column(String, nullable=False)
    risk_threshold = Column(String, nullable=False)
    default_outcome = Column(String, nullable=False)
    conditions = Column(Text, nullable=True)
    reg_tag = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    version = Column(Integer, default=1)
    last_modified = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(String, nullable=True)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="Viewer")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True)


class ApiKeyDB(Base):
    __tablename__ = "api_keys"

    id = Column(String, primary_key=True)
    label = Column(String, nullable=False)
    key_hash = Column(String, nullable=False)  # sha256 of the raw key - raw shown once, never stored
    prefix = Column(String, nullable=False)  # short visible fragment eg ck_live_3f8a, for the masked display
    environment = Column(String, default="Production")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(String, nullable=True)
    revoked = Column(Boolean, default=False)


class ScheduledReportDB(Base):
    __tablename__ = "scheduled_reports"

    id = Column(String, primary_key=True)
    frequency = Column(String, nullable=False)  # daily, weekly, monthly
    recipient = Column(String, nullable=False)
    next_run = Column(DateTime(timezone=True), nullable=False)
    last_sent = Column(DateTime(timezone=True), nullable=True)
    status = Column(String, default="Active")  # Active, Paused
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ReportExportDB(Base):
    __tablename__ = "report_exports"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    generated_by = Column(String, nullable=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    format = Column(String, nullable=False)  # PDF or CSV
    size_bytes = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)  # the actual export body, stored inline - no file volume to lose it to
