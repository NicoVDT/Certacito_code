from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from backend.models.database import get_db
from backend.models.tables import PolicyRuleDB
from backend.models.schemas import PolicyRule
from backend.api.auth import get_current_user, require_role, ADMIN_ONLY
from backend.config import settings

router = APIRouter()


@router.get("/policies")
async def list_policies(db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    result = await db.execute(select(PolicyRuleDB).order_by(PolicyRuleDB.id))
    rules = result.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "action_type": r.action_type,
            "risk_threshold": r.risk_threshold,
            "default_outcome": r.default_outcome,
            "conditions": r.conditions,
            "reg_tag": r.reg_tag,
            "active": r.active,
            "version": r.version,
            "last_modified": r.last_modified.isoformat() if r.last_modified else None,
        }
        for r in rules
    ]


@router.post("/policies")
async def create_policy(rule: PolicyRule, db: AsyncSession = Depends(get_db), user=Depends(require_role(ADMIN_ONLY))):
    existing = await db.execute(
        select(PolicyRuleDB).where(PolicyRuleDB.id == rule.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Rule {rule.id} already exists")

    db_rule = PolicyRuleDB(
        id=rule.id,
        name=rule.name,
        action_type=rule.action_type,
        risk_threshold=rule.risk_threshold.value,
        default_outcome=rule.default_outcome.value,
        conditions=rule.conditions,
        reg_tag=rule.reg_tag,
        active=rule.active,
        version=rule.version,
        last_modified=datetime.now(timezone.utc),
    )
    db.add(db_rule)
    await db.commit()
    return {"status": "created", "id": rule.id}


@router.put("/policies/{rule_id}")
async def update_policy(rule_id: str, rule: PolicyRule, db: AsyncSession = Depends(get_db), user=Depends(require_role(ADMIN_ONLY))):
    result = await db.execute(
        select(PolicyRuleDB).where(PolicyRuleDB.id == rule_id)
    )
    existing = result.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")

    existing.name = rule.name
    existing.action_type = rule.action_type
    existing.risk_threshold = rule.risk_threshold.value
    existing.default_outcome = rule.default_outcome.value
    existing.conditions = rule.conditions
    existing.reg_tag = rule.reg_tag
    existing.active = rule.active
    existing.version = existing.version + 1  # bump
    existing.last_modified = datetime.now(timezone.utc)

    await db.commit()
    return {"status": "updated", "id": rule_id, "version": existing.version}


@router.delete("/policies/{rule_id}")
async def delete_policy(rule_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_role(ADMIN_ONLY))):
    result = await db.execute(
        select(PolicyRuleDB).where(PolicyRuleDB.id == rule_id)
    )
    existing = result.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Rule not found")

    await db.delete(existing)
    await db.commit()
    return {"status": "deleted", "id": rule_id}


import yaml

@router.get("/policies/library")
async def get_rule_library(user=Depends(get_current_user)):
    """Get the pre-built rule library for regulated industries."""
    try:
        with open(settings.rule_library_path, "r") as f:
            data = yaml.safe_load(f)
        return data.get("rules", [])
    except FileNotFoundError:
        return []


@router.post("/policies/library/{rule_id}/import")
async def import_library_rule(rule_id: str, db: AsyncSession = Depends(get_db), user=Depends(require_role(ADMIN_ONLY))):
    """Import a rule from the library into the active policy set."""
    try:
        with open(settings.rule_library_path, "r") as f:
            data = yaml.safe_load(f)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Rule library not found")

    lib_rule = None
    for r in data.get("rules", []):
        if r["id"] == rule_id:
            lib_rule = r
            break

    if not lib_rule:
        raise HTTPException(status_code=404, detail=f"Rule {rule_id} not in library")

    existing = await db.execute(
        select(PolicyRuleDB).where(PolicyRuleDB.id == rule_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Rule {rule_id} already active")

    db_rule = PolicyRuleDB(
        id=lib_rule["id"],
        name=lib_rule["name"],
        action_type=lib_rule["action_type"],
        risk_threshold=lib_rule["risk_threshold"],
        default_outcome=lib_rule["default_outcome"],
        conditions=lib_rule.get("conditions"),
        reg_tag=lib_rule.get("reg_tag", ""),
        active=lib_rule.get("active", True),
        version=lib_rule.get("version", 1),
    )
    db.add(db_rule)
    await db.commit()
    return {"status": "imported", "id": rule_id, "name": lib_rule["name"]}
