import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from backend.models.tables import AuditLog
from backend.models.schemas import Outcome, RiskLevel

# fix: prevent concurrent intercepts where two concurrent intercepts would both read the
# same chain head and then each append, forking the whole chain. we only run a
# single uvicorn process so a plain lock is enough to serialise the appends.
# TODO: if we ever go multi-worker we'd need a db-level lock here
_append_lock = asyncio.Lock()


class AuditService:
    """hash-chained audit trail. each entry hashes the previous one."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def log_decision(
        self,
        agent_id: str,
        action_type: str,
        policy_rule: Optional[str],
        policy_desc: Optional[str],
        risk_level: RiskLevel,
        outcome: Outcome,
        payload: dict,
        session_id: Optional[str] = None,
    ) -> AuditLog:
        async with _append_lock:
            # grab the previous entry's hash so we can chain to it
            prev_hash = await self._get_last_hash()

            # mask out PII in the payload before we store it anywhere
            masked_payload = self._mask_pii(payload)

            # hash the raw payload (BEFORE masking) for integrity checking
            payload_hash = hashlib.sha256(
                json.dumps(payload, sort_keys=True, default=str).encode()
            ).hexdigest()

            # build the entry id and timestamp
            entry_id = f"AUC-{uuid.uuid4().hex[:8].upper()}"
            now = datetime.now(timezone.utc)

            # compute the entry hash - this is what makes the record tamper-evident
            entry_data = f"{entry_id}{now.isoformat()}{agent_id}{action_type}{outcome.value}{payload_hash}{prev_hash}"
            entry_hash = hashlib.sha256(entry_data.encode()).hexdigest()

            # print("[audit] entry", entry_id, "outcome=", outcome.value)

            record = AuditLog(
                id=entry_id,
                timestamp=now,
                agent_id=agent_id,
                action_type=action_type,
                policy_rule=policy_rule,
                policy_desc=policy_desc,
                risk_level=risk_level.value,
                outcome=outcome.value,
                payload_masked=json.dumps(masked_payload),
                payload_hash=payload_hash,
                prev_hash=prev_hash,
                entry_hash=entry_hash,
                session_id=session_id,
            )

            self.db.add(record)
            await self.db.commit()
            await self.db.refresh(record)
            return record

    async def _get_last_hash(self) -> str:
        # get hash of the most recent audit entry, for chaining
        result = await self.db.execute(
            select(AuditLog.entry_hash).order_by(desc(AuditLog.timestamp)).limit(1)
        )
        last = result.scalar_one_or_none()
        if last is None:
            # genesis entry - just use a known seed string
            return hashlib.sha256(b"certacito-genesis-block").hexdigest()
        return last

    def _mask_pii(self, payload: dict) -> dict:
        # replace sensitive-looking fields with masked versions. looks for
        # common PII field names and redacts the values.
        sensitive_keys = {"email", "name", "phone", "medicare", "patient_id", "ssn", "address", "dob"}
        masked = {}

        for key, val in payload.items():
            if key.lower() in sensitive_keys and isinstance(val, str):
                if len(val) > 4:
                    masked[key] = val[0] + "***" + val[-1]
                else:
                    masked[key] = "***"
            else:
                masked[key] = val

        return masked

    async def get_entries(self, limit: int = 50, offset: int = 0) -> list[AuditLog]:
        result = await self.db.execute(
            select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def verify_chain(self, entries: list[AuditLog]) -> bool:
        # verify the hash chain is intact. returns False if any entry's
        # prev_hash doesn't match the preceding record (tampering occured)
        prev_hash = None
        for i in range(1, len(entries)):
            if entries[i].prev_hash != entries[i - 1].entry_hash:
                return False
        return True
