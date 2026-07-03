from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from backend.services.rate_limiter import limiter, auth_limiter


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # behind nginx every request looks like 127.0.0.1, so trust the proxy
        # header first. otherwise one dashboard user + the simulator would
        # share a single bucket and trip the limit constantly. ugh.
        client_ip = request.headers.get("x-real-ip") or (
            request.client.host if request.client else "unknown"
        )

        # stricter limit on the auth endpoints
        if "/auth/login" in request.url.path or "/auth/register" in request.url.path:
            if not auth_limiter.is_allowed(client_ip):
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many attempts. Try again later."}
                )

        # general rate limit
        if not limiter.is_allowed(client_ip):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Max 240 requests/minute."}
            )

        # print("[ratemw] allowed", client_ip, request.url.path)
        return await call_next(request)
