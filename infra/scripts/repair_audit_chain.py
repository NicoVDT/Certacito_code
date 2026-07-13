"""
One-off repair for the audit hash chain.

A race in AuditService.log_decision let two concurrent intercepts read the
same chain head and both append to it, which forked the chain (4 known forks,
found 2026-07-20). The race itself is fixed with a lock in audit.py - this
script re-links the historical forks so /audit/verify passes again.

Since entry_hash covers prev_hash, fixing one link means recomputing every
hash after it. Before touching anything it proves it can reproduce the stored
hashes of intact rows, so we know the recompute recipe is byte-identical.

Usage (inside CT/container with the app venv):
    .venv/bin/python infra/scripts/repair_audit_chain.py           # dry run
    .venv/bin/python infra/scripts/repair_audit_chain.py --apply   # write
"""
import asyncio
import hashlib
import sys

sys.path.insert(0, ".")

from sqlalchemy import select, text  # noqa: E402
from backend.models.database import async_session  # noqa: E402
from backend.models.tables import AuditLog  # noqa: E402

GENESIS = hashlib.sha256(b"certacito-genesis-block").hexdigest()


def compute_hash(e_id, ts, agent_id, action_type, outcome, payload_hash, prev_hash):
    data = f"{e_id}{ts.isoformat()}{agent_id}{action_type}{outcome}{payload_hash}{prev_hash}"
    return hashlib.sha256(data.encode()).hexdigest()


async def main():
    apply = "--apply" in sys.argv
    async with async_session() as db:
        rows = (await db.execute(
            select(AuditLog).order_by(AuditLog.timestamp, AuditLog.id)
        )).scalars().all()
        print(f"loaded {len(rows)} entries")

        # sanity check: our recompute must match the stored hash on rows whose
        # link is already intact, otherwise we would corrupt the whole log
        ok = bad = 0
        head = GENESIS
        for r in rows[:2000]:
            if r.prev_hash == head:
                recomputed = compute_hash(r.id, r.timestamp, r.agent_id,
                                          r.action_type, r.outcome,
                                          r.payload_hash, r.prev_hash)
                if recomputed == r.entry_hash:
                    ok += 1
                else:
                    bad += 1
            head = r.entry_hash
        print(f"recompute sanity: {ok} match, {bad} mismatch")
        if bad or not ok:
            print("hash recipe does not reproduce stored hashes - aborting")
            return

        # walk the chain and relink anything that doesn't point at the running head
        head = GENESIS
        fixes = []
        for r in rows:
            if r.prev_hash != head:
                new_entry = compute_hash(r.id, r.timestamp, r.agent_id,
                                         r.action_type, r.outcome,
                                         r.payload_hash, head)
                fixes.append((r.id, head, new_entry))
                head = new_entry
            else:
                head = r.entry_hash

        print(f"{len(fixes)} entries need relinking")
        if not apply:
            for f in fixes[:10]:
                print("  would fix", f[0])
            print("dry run only - rerun with --apply")
            return

        # batched VALUES update - row-at-a-time took 20+ minutes for 16k rows.
        # ids and hashes are plain [A-F0-9-] so inline quoting is safe here
        for i in range(0, len(fixes), 2000):
            chunk = fixes[i:i + 2000]
            values = ",".join(f"('{a}','{b}','{c}')" for a, b, c in chunk)
            await db.execute(text(
                "UPDATE audit_log AS al SET prev_hash = v.p, entry_hash = v.e "
                f"FROM (VALUES {values}) AS v(id, p, e) WHERE al.id = v.id"))
            print(f"  {min(i + 2000, len(fixes))}/{len(fixes)}")
        await db.commit()
        print(f"applied {len(fixes)} fixes")


asyncio.run(main())
