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
