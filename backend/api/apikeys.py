import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.models.database import get_db
from backend.models.tables import ApiKeyDB, User
from backend.api.auth import get_current_user, require_role, ADMIN_ONLY

router = APIRouter()


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _generate_key(environment: str) -> tuple[str, str]:
    # returns (raw_key, masked_display). raw is only shown once at creation
    env_tag = "prod" if environment == "Production" else "stag"
    token = secrets.token_urlsafe(32)
    raw = f"ck_{env_tag}_{token}"
    masked = f"ck_{env_tag}_{'•' * 20}{raw[-4:]}"
    return raw, masked


class ApiKeyCreate(BaseModel):
    label: str
    environment: str = "Production"


def _serialize(key: ApiKeyDB) -> dict:
    return {
        "id": key.id,
        "label": key.label,
        "masked": key.prefix,
        "environment": key.environment,
        "created": key.created_at.date().isoformat() if key.created_at else None,
        "last_used": key.last_used_at.isoformat() if key.last_used_at else "Never used",
        "created_by": key.created_by,
        "revoked": key.revoked,
    }


@router.get("/apikeys")
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(ApiKeyDB).order_by(ApiKeyDB.created_at.desc()))
    return [_serialize(k) for k in result.scalars().all()]


@router.post("/apikeys")
async def create_api_key(
    body: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(ADMIN_ONLY)),
):
    raw, masked = _generate_key(body.environment)
    key = ApiKeyDB(
        id=str(uuid.uuid4()),
        label=body.label,
        key_hash=_hash_key(raw),
        prefix=masked,
        environment=body.environment,
        created_by=user.email,
    )
    db.add(key)
    await db.commit()
    # only time the raw key is sent back - ui has to show it once + warn
    return {**_serialize(key), "key": raw}


@router.post("/apikeys/{key_id}/rotate")
async def rotate_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(ADMIN_ONLY)),
):
    result = await db.execute(select(ApiKeyDB).where(ApiKeyDB.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    raw, masked = _generate_key(key.environment)
    key.key_hash = _hash_key(raw)
    key.prefix = masked
    await db.commit()
    # print(f"[debug] rotated key {key_id} for {user.email}")
    return {**_serialize(key), "key": raw}


@router.delete("/apikeys/{key_id}")
async def revoke_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(ADMIN_ONLY)),
):
    result = await db.execute(select(ApiKeyDB).where(ApiKeyDB.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Key not found")
    key.revoked = True
    await db.commit()
    return {"status": "revoked", "id": key_id}
