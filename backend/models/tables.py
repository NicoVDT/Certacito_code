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


# TODO: AuditLog

# TODO: ApprovalQueue

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


# TODO: ApiKeyDB

# TODO: ScheduledReportDB

# TODO: ReportExportDB
