import ipaddress
import logging
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend.config import settings
from backend.services.rate_limiter import limiter, auth_limiter

log = logging.getLogger(__name__)


def _parse_networks(raw: str):
    nets = []
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            nets.append(ipaddress.ip_network(part, strict=False))
        except ValueError:
            log.warning("ignoring unparseable entry in TRUSTED_PROXIES: %r", part)
    return nets


_TRUSTED_NETS = _parse_networks(settings.trusted_proxies)


def _is_trusted_peer(peer: Optional[str]) -> bool:
    if not peer:
        return False
    try:
        addr = ipaddress.ip_address(peer)
    except ValueError:
        return False
    return any(addr in net for net in _TRUSTED_NETS)


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
        control actually sets it, AND the request reached us from one of the
        trusted_proxies ranges. the flag alone is not enough: it means "a proxy
        overwrites this header", which is only true of traffic that went
        through the proxy. the container publishes 80 straight out, so plenty
        of traffic does not, and for that the header is just whatever the
        caller typed. a different value per request is a fresh bucket per
        request and no limit at all - including on /auth/login, which is the
        one thing standing between a password and an offline guess list.

        a value that isn't an ip is ignored too. caddy overwrites the header so
        it should never happen, but the value ends up in a redis key name and
        an unbounded one is not something to take on trust.
        """
        peer = request.client.host if request.client else None

        if settings.trust_proxy_header and _is_trusted_peer(peer):
            forwarded = request.headers.get("x-real-ip")
            if forwarded:
                candidate = forwarded.split(",")[0].strip()
                try:
                    ipaddress.ip_address(candidate)
                    return candidate
                except ValueError:
                    log.warning("x-real-ip from %s was not an ip address, ignoring", peer)

        return peer or "unknown"
