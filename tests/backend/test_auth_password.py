"""
password hashing. these cover the reason bcrypt was pinned to 4.0.1.

passlib probed its bcrypt backend with an over-length string on import;
bcrypt 4.1 raises on that instead of truncating, so unpinning broke every
login on a clean install. auth.py calls bcrypt directly now and truncates
to 72 bytes itself, which is what passlib was doing anyway.
"""
from backend.api.auth import hash_password, verify_password

# generated under bcrypt with the standard $2b$ prefix, which is the format
# passlib wrote too - existing rows have to keep verifying after the switch
LEGACY_HASH = "$2b$12$uUhO0A2wva1mLDMpdqUwROArWvGd3JDJ3QkHCsLfddWfpun1UIKWm"


def test_roundtrip():
    hashed = hash_password("test123")
    assert verify_password("test123", hashed)
    assert not verify_password("wrong", hashed)


def test_hashes_written_before_the_switch_still_verify():
    assert verify_password("test123", LEGACY_HASH)
    assert not verify_password("test1234", LEGACY_HASH)


def test_long_password_does_not_raise():
    # the actual regression. bcrypt 4.1+ raises on >72 bytes rather than
    # truncating, and this is the path that made the pin necessary
    long = "a" * 200
    hashed = hash_password(long)
    assert verify_password(long, hashed)


def test_password_is_compared_on_the_first_72_bytes():
    # documenting bcrypt's actual behaviour rather than pretending otherwise:
    # anything past 72 bytes is not part of the comparison
    base = "x" * 72
    hashed = hash_password(base)
    assert verify_password(base + "completely different tail", hashed)


def test_multibyte_password():
    # truncation is on bytes, not characters, so a multibyte password must
    # still round-trip rather than blowing up on a split character
    pw = "pässwörd-🔐-ünïcödé"
    assert verify_password(pw, hash_password(pw))


def test_malformed_stored_hash_is_not_a_match():
    # bcrypt raises ValueError on a hash it can't parse. a corrupt row should
    # fail the login, not 500 the endpoint
    assert not verify_password("test123", "not-a-bcrypt-hash")
    assert not verify_password("test123", "")
