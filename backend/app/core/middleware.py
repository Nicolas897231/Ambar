from collections import defaultdict
from time import time
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.services.cache import increment_window
from app.services.metrics import metrics_registry, now


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request.state.request_id = request.headers.get("x-request-id", str(uuid4()))
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        started = now()
        response = await call_next(request)
        metrics_registry.observe(request.url.path, response.status_code, now() - started)
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
        if get_settings().is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


class DistributedRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        self._fallback_hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        ip = request.client.host if request.client else "unknown"
        key = f"rl:{ip}:{request.url.path}"
        limit = settings.rate_limit_per_minute
        redis_count = increment_window(key, ttl_seconds=60)
        if redis_count is not None:
            if redis_count > limit:
                return JSONResponse({"detail": "Too many requests"}, status_code=429)
            return await call_next(request)

        if settings.is_production:
            return JSONResponse({"detail": "Rate limiter unavailable"}, status_code=503)

        now_value = time()
        self._fallback_hits[key] = [hit for hit in self._fallback_hits[key] if now_value - hit < 60]
        if len(self._fallback_hits[key]) >= limit:
            return JSONResponse({"detail": "Too many requests"}, status_code=429)
        self._fallback_hits[key].append(now_value)
        return await call_next(request)