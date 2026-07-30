# rate limiting. redis-backed so the counters are shared, with the old
# in-memory limiter kept as a fallback for when redis isn't reachable.
#
# the in-memory version was fine while there was exactly one container, but
# the counters live in the process, so a second replica doubles everyones
# real limit and a restart wipes every bucket - which is also a free way to
# clear the login throttle.
#
# when redis is down we fall back to counting in-process rather than failing
# the request. a limiter that hard-fails turns a redis blip into a total
# outage, and the fallback still enforces the limit, just per-instance.
import logging
import time
from collections import defaultdict

from backend.config import settings

log = logging.getLogger(__name__)


class _InMemoryWindow:
    """sliding window in process memory. the fallback, and the old behaviour."""

    def __init__(self):
        self._requests: dict[str, list[float]] = defaultdict(list)

    def allow(self, key: str, max_requests: int, window: int) -> bool:
        now = time.time()
        kept = [t for t in self._requests[key] if t > now - window]
        self._requests[key] = kept
        if len(kept) >= max_requests:
            return False
        kept.append(now)
        return True


class RateLimiter:
    def __init__(self, max_requests: int = 60, window_seconds: int = 60, namespace: str = "rl"):
        self.max_requests = max_requests
        self.window = window_seconds
        self.namespace = namespace
        self._fallback = _InMemoryWindow()
        self._redis = None
        self._redis_failed = False

    async def _client(self):
        # built on first use - at import time there is no event loop yet
        if self._redis is not None or self._redis_failed:
            return self._redis
        try:
            from redis import asyncio as aioredis

            self._redis = aioredis.from_url(
                settings.redis_url, encoding="utf-8", decode_responses=True
            )
            await self._redis.ping()
        except Exception as exc:
            # log once, then stop retrying on every request - a dead redis
            # shouldn't cost a connection attempt per call
            log.warning("rate limiter falling back to in-memory: %s", exc)
            self._redis = None
            self._redis_failed = True
        return self._redis

    async def is_allowed(self, key: str) -> bool:
        client = await self._client()
        if client is None:
            return self._fallback.allow(key, self.max_requests, self.window)

        now = time.time()
        redis_key = f"{self.namespace}:{key}"
        try:
            # sorted set keyed by timestamp: drop anything outside the window,
            # count whats left, add this request, and let the key expire on its
            # own so idle clients don't sit in redis forever. pipelined so the
            # trim and the count can't interleave with another request.
            pipe = client.pipeline()
            pipe.zremrangebyscore(redis_key, 0, now - self.window)
            pipe.zcard(redis_key)
            pipe.zadd(redis_key, {f"{now}:{id(object())}": now})
            pipe.expire(redis_key, self.window)
            _, count, _, _ = await pipe.execute()
        except Exception as exc:
            log.warning("rate limiter redis error, using in-memory: %s", exc)
            self._redis_failed = True
            self._redis = None
            return self._fallback.allow(key, self.max_requests, self.window)

        # zcard ran before our own zadd, so count is the number already in the
        # window - allow while that is still under the limit
        return count < self.max_requests


# 240/min per ip. the dashboard polls a few endpoints on an interval so 60 was
# way too tight once the live feed had been on screen a while
limiter = RateLimiter(max_requests=240, window_seconds=60, namespace="rl:general")

# stricter bucket for the auth endpoints - 10 attempts per minute
auth_limiter = RateLimiter(max_requests=10, window_seconds=60, namespace="rl:auth")
