from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend.config import settings
from backend.services.rate_limiter import limiter, auth_limiter


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = self._client_ip(request)

        # stricter limit on the auth endpoints
        if "/auth/login" in request.url.path or "/auth/register" in request.url.path:
            if not await auth_limiter.is_allowed(client_ip):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many attempts. Try again later."}
                )

        # general rate limit
        if not await limiter.is_allowed(client_ip):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Max 240 requests/minute."}
            )

        return await call_next(request)

    @staticmethod
    def _client_ip(request: Request) -> str:
        """
        who to count this request against.

        x-real-ip is only trusted when trust_proxy_header says something we
        control actually sets it. it used to be trusted unconditionally, which
        is fine behind a proxy that overwrites it and a hole when nothing does:
        the app publishes 80:8000 straight out, so the header arrives from the
        client. a different value per request means a fresh bucket per request
        and no limit at all - including on /auth/login, which is the one
        standing between a password and an offline guess list.
        """
        if settings.trust_proxy_header:
            forwarded = request.headers.get("x-real-ip")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"
