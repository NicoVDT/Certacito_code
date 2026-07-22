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

GENESIS_HASH = hashlib.sha256(b"certacito-genesis-block").hexdigest()


def entry_preimage(entry_id, timestamp, agent_id, action_type, outcome, payload_hash,
                   prev_hash, risk_level=None, policy_rule=None, policy_desc=None,
                   session_id=None, payload_masked=None) -> str:
    """
    the exact string an entry's hash is taken over. append and verify both go
    through here - when they drifted apart verify was only comparing the stored
    hashes to each other, so you could edit a row and it still came back valid.

    every column we display is in here now. the old recipe only covered seven
    fields, so risk_level and the masked payload could be rewritten without
    breaking anything - ie you could drop a Critical to Low and the log still
    verified. json with sorted keys rather than string concat so two different
    rows can't produce the same preimage by shifting where one field ends.
    """
    return json.dumps({
        "id": entry_id,
        "timestamp": timestamp.isoformat(),
        "agent_id": agent_id,
        "action_type": action_type,
        "outcome": outcome,
        "risk_level": risk_level,
        "policy_rule": policy_rule,
        "policy_desc": policy_desc,
        "session_id": session_id,
        "payload_hash": payload_hash,
        "payload_masked": payload_masked,
        "prev_hash": prev_hash,
    }, sort_keys=True, separators=(",", ":"), default=str)


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

            # serialise once and hash the same string we store, otherwise the
            # masked payload isn't actually covered by the hash
            masked_json = json.dumps(masked_payload)

            # compute the entry hash - this is what makes the record tamper-evident
            entry_data = entry_preimage(
                entry_id, now, agent_id, action_type, outcome.value, payload_hash, prev_hash,
                risk_level=risk_level.value, policy_rule=policy_rule, policy_desc=policy_desc,
                session_id=session_id, payload_masked=masked_json,
            )
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
                payload_masked=masked_json,
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

    async def verify_full_chain(self, batch: int = 5000) -> tuple[bool, int, Optional[str]]:
        """
        walk every entry from genesis forward, oldest first, in batches so a
        long log doesn't all land in memory at once. returns
        (valid, entries_checked, first_bad_id).
        """
        expected_prev = GENESIS_HASH
        checked = 0
        offset = 0
        while True:
            result = await self.db.execute(
                select(AuditLog).order_by(AuditLog.timestamp, AuditLog.id).limit(batch).offset(offset)
            )
            rows = list(result.scalars().all())
            if not rows:
                return (True, checked, None)

            bad = self.find_broken_entry(rows, expected_prev=expected_prev)
            if bad is not None:
                # count how many verified cleanly before the break, so the
                # number we report is where it failed rather than just "1"
                ok_before = next(i for i, r in enumerate(rows) if r.id == bad)
                return (False, checked + ok_before, bad)

            checked += len(rows)
            expected_prev = rows[-1].entry_hash
            offset += batch

    async def verify_chain(self, entries: list[AuditLog]) -> bool:
        """
        walk the chain oldest-first. two things have to hold for every entry:
        its own hash has to still match its contents, and it has to point at
        the entry before it. only checking the second one (which is what we
        used to do) means someone can rewrite a row - flip a DENY to a PERMIT,
        drop a Critical to Low - and the chain still reports valid, because
        nothing ever recomputes the hash off the row itself.
        """
        return self.find_broken_entry(entries) is None

    def find_broken_entry(self, entries: list[AuditLog], expected_prev: str = GENESIS_HASH) -> Optional[str]:
        """same walk, but returns the id of the first bad entry (None = clean)."""
        for e in entries:
            recomputed = hashlib.sha256(
                entry_preimage(e.id, e.timestamp, e.agent_id, e.action_type,
                               e.outcome, e.payload_hash, e.prev_hash,
                               risk_level=e.risk_level, policy_rule=e.policy_rule,
                               policy_desc=e.policy_desc, session_id=e.session_id,
                               payload_masked=e.payload_masked).encode()
            ).hexdigest()
            if recomputed != e.entry_hash:
                return e.id
            if e.prev_hash != expected_prev:
                return e.id
            expected_prev = e.entry_hash
        return None
