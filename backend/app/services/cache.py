import json
from collections.abc import Callable
from functools import lru_cache
from typing import TypeVar

from redis import Redis

from app.core.config import get_settings

T = TypeVar("T")

_LOGIN_LOCKOUT_PREFIX = "lockout:"
_LOGIN_ATTEMPTS_PREFIX = "login_attempts:"
_TOKEN_BLACKLIST_PREFIX = "token_blacklist:"
_TOTP_USED_PREFIX = "totp_used:"

LOGIN_MAX_ATTEMPTS = 5
LOGIN_LOCKOUT_SECONDS = 900  # 15 minutos


@lru_cache(maxsize=1)
def _redis_client() -> Redis:
    settings = get_settings()
    return Redis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=2,
        health_check_interval=30,
    )


def redis_client() -> Redis | None:
    try:
        return _redis_client()
    except Exception:
        return None


def get_json(key: str) -> dict | list | None:
    client = redis_client()
    if not client:
        return None
    try:
        value = client.get(key)
        return json.loads(value) if value else None
    except Exception:
        return None


def set_json(key: str, value: dict | list, ttl: int | None = None) -> None:
    client = redis_client()
    if not client:
        return
    try:
        client.set(key, json.dumps(value, default=str), ex=ttl or get_settings().cache_default_ttl_seconds)
    except Exception:
        return


def increment_window(key: str, ttl_seconds: int) -> int | None:
    client = redis_client()
    if not client:
        return None
    try:
        pipe = client.pipeline()
        pipe.incr(key)
        pipe.expire(key, ttl_seconds, nx=True)
        value, _ = pipe.execute()
        return int(value)
    except Exception:
        return None


def delete_pattern(pattern: str) -> int:
    client = redis_client()
    if not client:
        return 0
    try:
        keys = list(client.scan_iter(pattern))
        if keys:
            return int(client.delete(*keys))
        return 0
    except Exception:
        return 0


def cached(key: str, factory: Callable[[], T], ttl: int | None = None) -> T:
    cached_value = get_json(key)
    if cached_value is not None:
        return cached_value  # type: ignore[return-value]
    value = factory()
    if isinstance(value, (dict, list)):
        set_json(key, value, ttl)
    return value


# ── Login lockout ──────────────────────────────────────────────────────────────

def is_account_locked(identifier: str) -> bool:
    """True si la cuenta está en período de bloqueo por intentos fallidos."""
    client = redis_client()
    if not client:
        return False
    try:
        return client.exists(f"{_LOGIN_LOCKOUT_PREFIX}{identifier}") == 1
    except Exception:
        return False


def record_failed_login(identifier: str) -> int:
    """Incrementa el contador de intentos fallidos. Bloquea la cuenta si supera el límite.
    Retorna el número de intentos acumulados."""
    client = redis_client()
    if not client:
        return 0
    try:
        attempts_key = f"{_LOGIN_ATTEMPTS_PREFIX}{identifier}"
        pipe = client.pipeline()
        pipe.incr(attempts_key)
        pipe.expire(attempts_key, LOGIN_LOCKOUT_SECONDS, nx=True)
        attempts, _ = pipe.execute()
        attempts = int(attempts)
        if attempts >= LOGIN_MAX_ATTEMPTS:
            lockout_key = f"{_LOGIN_LOCKOUT_PREFIX}{identifier}"
            client.set(lockout_key, "1", ex=LOGIN_LOCKOUT_SECONDS)
        return attempts
    except Exception:
        return 0


def clear_failed_logins(identifier: str) -> None:
    """Limpia contadores tras login exitoso."""
    client = redis_client()
    if not client:
        return
    try:
        client.delete(f"{_LOGIN_ATTEMPTS_PREFIX}{identifier}")
        client.delete(f"{_LOGIN_LOCKOUT_PREFIX}{identifier}")
    except Exception:
        return


# ── Token blacklist (access tokens revocados) ─────────────────────────────────

def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Añade un JTI de access token a la lista negra hasta su expiración natural."""
    client = redis_client()
    if not client:
        return
    try:
        client.set(f"{_TOKEN_BLACKLIST_PREFIX}{jti}", "1", ex=ttl_seconds)
    except Exception:
        return


def is_token_blacklisted(jti: str) -> bool:
    """True si el JTI del token está en la lista negra."""
    client = redis_client()
    if not client:
        return False
    try:
        return client.exists(f"{_TOKEN_BLACKLIST_PREFIX}{jti}") == 1
    except Exception:
        return False


# ── TOTP replay protection ────────────────────────────────────────────────────

def mark_totp_used(user_id: str, code: str) -> bool:
    """Registra el código TOTP como usado. Retorna False si ya fue utilizado (replay)."""
    client = redis_client()
    if not client:
        return True  # sin Redis no bloqueamos, registramos el riesgo
    try:
        key = f"{_TOTP_USED_PREFIX}{user_id}:{code}"
        result = client.set(key, "1", ex=90, nx=True)  # TTL de 3 ventanas TOTP
        return result is True
    except Exception:
        return True
