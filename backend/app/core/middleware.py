from collections import defaultdict
from time import time
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.services.cache import increment_window
from app.services.metrics import metrics_registry, now

# Límites específicos por endpoint sensible (req/min por IP)
_SENSITIVE_LIMITS: dict[str, int] = {
    "/api/v1/auth/login": 10,
    "/api/v1/auth/refresh": 20,
}


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
        settings = get_settings()
        path = request.url.path

        # Universal security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["X-DNS-Prefetch-Control"] = "off"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"

        # API paths and health checks: strict CSP + no caching (pure JSON, no scripts)
        if path.startswith("/api/") or path in ("/health", "/health/live", "/health/ready", "/metrics"):
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none';"
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response.headers["Pragma"] = "no-cache"
        else:
            # /docs, /redoc, /openapi.json — dev-only swagger UI needs unsafe-inline
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "font-src 'self' data:; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "object-src 'none'; "
                "base-uri 'self';"
            )

        # HSTS: always on; short max-age outside production to ease rollback
        max_age = 31536000 if settings.is_production else 300
        hsts = f"max-age={max_age}; includeSubDomains"
        if settings.is_production:
            hsts += "; preload"
        response.headers["Strict-Transport-Security"] = hsts
        return response


class DistributedRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        self._fallback_hits: dict[str, list[float]] = defaultdict(list)

    async def dispatch(self, request: Request, call_next) -> Response:
        settings = get_settings()
        ip = request.client.host if request.client else "unknown"
        path = request.url.path

        # Límite específico para endpoints sensibles (más restrictivo)
        limit = _SENSITIVE_LIMITS.get(path, settings.rate_limit_per_minute)
        key = f"rl:{ip}:{path}"
        redis_count = increment_window(key, ttl_seconds=60)

        if redis_count is not None:
            if redis_count > limit:
                return JSONResponse(
                    {"detail": "Too many requests", "retry_after": 60},
                    status_code=429,
                    headers={"Retry-After": "60"},
                )
            return await call_next(request)

        if settings.is_production:
            return JSONResponse({"detail": "Rate limiter unavailable"}, status_code=503)

        now_value = time()
        self._fallback_hits[key] = [hit for hit in self._fallback_hits[key] if now_value - hit < 60]
        if len(self._fallback_hits[key]) >= limit:
            return JSONResponse(
                {"detail": "Too many requests", "retry_after": 60},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        self._fallback_hits[key].append(now_value)
        return await call_next(request)
