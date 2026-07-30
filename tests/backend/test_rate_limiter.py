"""
rate limiter. redis is optional here - the tests that care about the shared
counter force the in-memory fallback, so they run the same whether or not a
redis is up (CI has no redis service).
"""
import asyncio

from starlette.requests import Request

from backend.services.rate_limiter import RateLimiter
from backend.services.rate_middleware import RateLimitMiddleware


def local_limiter(max_requests, window=60):
    """a limiter pinned to the in-memory path, no redis involved"""
    rl = RateLimiter(max_requests=max_requests, window_seconds=window, namespace="test")
    rl._redis_failed = True
    return rl


def run(coro):
    return asyncio.run(coro)


def test_allows_up_to_the_limit_then_blocks():
    rl = local_limiter(3)

    async def go():
        return [await rl.is_allowed("1.2.3.4") for _ in range(5)]

    assert run(go()) == [True, True, True, False, False]


def test_buckets_are_per_key():
    rl = local_limiter(2)

    async def go():
        await rl.is_allowed("a")
        await rl.is_allowed("a")
        # a is spent, b should still have its own allowance
        return await rl.is_allowed("a"), await rl.is_allowed("b")

    spent, other = run(go())
    assert spent is False
    assert other is True


def test_window_expiry_lets_requests_through_again():
    rl = local_limiter(1, window=1)

    async def go():
        first = await rl.is_allowed("k")
        second = await rl.is_allowed("k")
        await asyncio.sleep(1.1)
        return first, second, await rl.is_allowed("k")

    first, second, third = run(go())
    assert (first, second, third) == (True, False, True)


def test_falls_back_instead_of_failing_when_redis_is_unreachable():
    # a limiter that hard-fails turns a redis blip into a total outage. point
    # it at a dead port and it should still answer, just from memory
    rl = RateLimiter(max_requests=1, window_seconds=60, namespace="test")
    from backend.config import settings

    original = settings.redis_url
    settings.redis_url = "redis://127.0.0.1:1/0"
    try:
        assert run(rl.is_allowed("k")) is True
        assert run(rl.is_allowed("k")) is False
    finally:
        settings.redis_url = original


# --- client identification --------------------------------------------------

def make_request(headers: dict, peer: str = "10.0.0.1"):
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "path": "/api/v1/stats/dashboard",
        "headers": raw,
        "client": (peer, 12345),
        "scheme": "http",
        "server": ("testserver", 80),
        "query_string": b"",
    })


def test_x_real_ip_is_ignored_unless_a_proxy_is_configured():
    # the header used to be trusted unconditionally. nothing in front of the
    # app sets it - the container publishes 80:8000 directly - so it arrives
    # from the client, and a fresh value per request means a fresh bucket per
    # request and no limit at all, /auth/login included
    from backend.config import settings

    original = settings.trust_proxy_header
    settings.trust_proxy_header = False
    try:
        req = make_request({"x-real-ip": "1.1.1.1"}, peer="10.0.0.1")
        assert RateLimitMiddleware._client_ip(req) == "10.0.0.1"
    finally:
        settings.trust_proxy_header = original


def test_x_real_ip_is_used_when_a_proxy_is_configured():
    from backend.config import settings

    original = settings.trust_proxy_header
    settings.trust_proxy_header = True
    try:
        req = make_request({"x-real-ip": "1.1.1.1"}, peer="10.0.0.1")
        assert RateLimitMiddleware._client_ip(req) == "1.1.1.1"
        # a comma separated chain takes the first hop
        chained = make_request({"x-real-ip": "1.1.1.1, 2.2.2.2"}, peer="10.0.0.1")
        assert RateLimitMiddleware._client_ip(chained) == "1.1.1.1"
    finally:
        settings.trust_proxy_header = original


def test_missing_client_does_not_blow_up():
    scope = {
        "type": "http", "http_version": "1.1", "method": "GET", "path": "/",
        "headers": [], "client": None, "scheme": "http",
        "server": ("testserver", 80), "query_string": b"",
    }
    assert RateLimitMiddleware._client_ip(Request(scope)) == "unknown"
