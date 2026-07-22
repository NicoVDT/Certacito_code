"""
Re-chain the audit log onto the v2 hash recipe.

The old entry hash only covered seven fields, so risk_level, policy_rule,
policy_desc, session_id and payload_masked could all be edited in the database
without /audit/verify noticing. entry_preimage() now covers every stored column
(and uses sorted json instead of bare concatenation, so field boundaries can't
be shifted around). That changes every hash, so existing rows have to be
recomputed once or verify will report the whole log as broken.

Same safety model as repair_audit_chain.py: before writing anything it proves
it can reproduce the *stored* hashes using the old recipe. If it can't, we are
reading the rows wrong and must not touch them.

Usage (inside the container / CT with the app venv):
    python infra/scripts/rechain_audit_v2.py           # dry run
    python infra/scripts/rechain_audit_v2.py --apply   # write
"""
import asyncio
import hashlib
import sys

sys.path.insert(0, ".")

from sqlalchemy import select, text  # noqa: E402
from backend.models.database import async_session  # noqa: E402
from backend.models.tables import AuditLog  # noqa: E402
from backend.services.audit import entry_preimage, GENESIS_HASH  # noqa: E402


def old_hash(e):
    """the pre-v2 recipe, only used to confirm we can read the rows correctly"""
    data = (f"{e.id}{e.timestamp.isoformat()}{e.agent_id}{e.action_type}"
            f"{e.outcome}{e.payload_hash}{e.prev_hash}")
    return hashlib.sha256(data.encode()).hexdigest()


def new_hash(e, prev_hash):
    return hashlib.sha256(entry_preimage(
        e.id, e.timestamp, e.agent_id, e.action_type, e.outcome, e.payload_hash,
        prev_hash, risk_level=e.risk_level, policy_rule=e.policy_rule,
        policy_desc=e.policy_desc, session_id=e.session_id,
        payload_masked=e.payload_masked,
    ).encode()).hexdigest()


async def main():
    apply = "--apply" in sys.argv
    async with async_session() as db:
        rows = (await db.execute(
            select(AuditLog).order_by(AuditLog.timestamp, AuditLog.id)
        )).scalars().all()
        print(f"loaded {len(rows)} entries")
        if not rows:
            print("nothing to do")
            return

        # sanity: the old recipe has to reproduce the stored hashes, otherwise
        # we are misreading a column and would write garbage over the log
        ok = bad = 0
        for r in rows[:2000]:
            if old_hash(r) == r.entry_hash:
                ok += 1
            else:
                bad += 1
        print(f"old-recipe sanity: {ok} match, {bad} mismatch")
        if bad or not ok:
            print("cannot reproduce stored hashes - aborting, log left untouched")
            return

        head = GENESIS_HASH
        updates = []
        for r in rows:
            h = new_hash(r, head)
            updates.append((r.id, head, h))
            head = h

        print(f"{len(updates)} entries to re-chain")
        if not apply:
            print("dry run only - rerun with --apply")
            return

        for i in range(0, len(updates), 2000):
            chunk = updates[i:i + 2000]
            values = ",".join(f"('{a}','{b}','{c}')" for a, b, c in chunk)
            await db.execute(text(
                "UPDATE audit_log AS al SET prev_hash = v.p, entry_hash = v.e "
                f"FROM (VALUES {values}) AS v(id, p, e) WHERE al.id = v.id"))
            print(f"  {min(i + 2000, len(updates))}/{len(updates)}")
        await db.commit()
        print(f"re-chained {len(updates)} entries")


asyncio.run(main())
