# simple in-memory rate limiter. tracks request counts per IP and blocks
# them if they go over the threshold. good enough for this scale - production
# would use Redis or something, but we're not production lol
import time
from collections import defaultdict


class RateLimiter:
    def __init__(self, max_requests: int = 60, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        # sweep out the old entries first
        self._requests[key] = [t for t in self._requests[key] if t > now - self.window]
        # then check the limit
        if len(self._requests[key]) >= self.max_requests:
            return False
        self._requests[key].append(now)
        allowed = True
        return allowed


# global instance - 240/min per IP. the dashboard polls a few endpoints on an
# interval so 60 was way too tight once the live feed had been on screen a while
limiter = RateLimiter(max_requests=240, window_seconds=60)

# stricter bucket for the auth endpoints - 10 attempts per minute
auth_limiter = RateLimiter(max_requests=10, window_seconds=60)
