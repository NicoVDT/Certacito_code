"""Tests for the audit service hash chaining."""
import sys
import hashlib

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from backend.services.audit import AuditService
from backend.models.schemas import Outcome, RiskLevel


def test_pii_masking():
    """Sensitive fields should get masked before storage."""
    svc = AuditService(db=MagicMock())

    payload = {
        "name": "John Smith",
        "email": "john@example.com",
        "medicare": "1234567890",
        "action": "read_record",
        "tool": "db_query",
    }

    masked = svc._mask_pii(payload)

    # sensitive fields should be masked
    assert masked["name"] == "J***h"
    assert masked["email"] == "j***m"
    assert masked["medicare"] == "1***0"

    # non-sensitive fields should be untouched
    assert masked["action"] == "read_record"
    assert masked["tool"] == "db_query"


def test_pii_masking_short_values():
    """Short PII values get fully masked."""
    svc = AuditService(db=MagicMock())
    payload = {"name": "Jo", "tool": "calc"}
    masked = svc._mask_pii(payload)
    assert masked["name"] == "***"
    assert masked["tool"] == "calc"


def test_genesis_hash_is_deterministic():
    """The genesis block hash should always be the same."""
    expected = hashlib.sha256(b"certacito-genesis-block").hexdigest()
    # just verify the constant is what we expect
    assert len(expected) == 64
    assert expected.startswith("d")  # just a sanity check on the hash


# --- tamper detection ------------------------------------------------------
# verify_chain used to only compare stored hashes to each other and never
# recompute one, so you could edit any column - flip a DENY to a PERMIT, drop
# a Critical to Low - and the log still came back valid. nothing tested that,
# because the only chain test asserted the happy path.

import json  # noqa: E402
import uuid  # noqa: E402
from datetime import datetime, timezone, timedelta  # noqa: E402
from backend.services.audit import entry_preimage, GENESIS_HASH  # noqa: E402


class _Row:
    """stand-in for an AuditLog row, so these don't need a database"""


def _entry(prev_hash, offset):
    e = _Row()
    e.id = "AUC-" + uuid.uuid4().hex[:8].upper()
    e.timestamp = datetime(2026, 8, 1, 12, 0, 0, tzinfo=timezone.utc) + timedelta(seconds=offset)
    e.agent_id = "AGT-test"
    e.action_type = "tool_invoke"
    e.outcome = "DENY"
    e.risk_level = "Critical"
    e.policy_rule = "RULE-005"
    e.policy_desc = "matched"
    e.session_id = "S-1"
    e.payload_masked = json.dumps({"tool": "letter_generator"})
    e.payload_hash = hashlib.sha256(b"{}").hexdigest()
    e.prev_hash = prev_hash
    e.entry_hash = hashlib.sha256(entry_preimage(
        e.id, e.timestamp, e.agent_id, e.action_type, e.outcome, e.payload_hash,
        prev_hash, risk_level=e.risk_level, policy_rule=e.policy_rule,
        policy_desc=e.policy_desc, session_id=e.session_id,
        payload_masked=e.payload_masked).encode()).hexdigest()
    return e


def _chain(n=3):
    out, prev = [], GENESIS_HASH
    for i in range(n):
        e = _entry(prev, i)
        out.append(e)
        prev = e.entry_hash
    return out


def _svc():
    return AuditService.__new__(AuditService)


def test_intact_chain_verifies():
    assert _svc().find_broken_entry(_chain()) is None


@pytest.mark.parametrize("field,value", [
    ("outcome", "PERMIT"),
    ("risk_level", "Low"),
    ("agent_id", "AGT-someone-else"),
    ("policy_rule", "RULE-999"),
    ("session_id", "S-9"),
    ("payload_masked", json.dumps({"tool": "something_else"})),
])
def test_edited_field_is_detected(field, value):
    chain = _chain()
    setattr(chain[1], field, value)
    assert _svc().find_broken_entry(chain) == chain[1].id


def test_replaced_hash_is_detected():
    chain = _chain()
    chain[1].entry_hash = "0" * 64
    assert _svc().find_broken_entry(chain) == chain[1].id


def test_deleted_first_entry_is_detected():
    """dropping the head used to be invisible - the walk started at index 1"""
    chain = _chain()
    assert _svc().find_broken_entry(chain[1:]) is not None


def test_deleted_middle_entry_is_detected():
    chain = _chain()
    del chain[1]
    assert _svc().find_broken_entry(chain) is not None
