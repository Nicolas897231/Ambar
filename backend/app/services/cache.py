import json
from collections.abc import Callable
from typing import TypeVar

from redis import Redis

from app.core.config import get_settings

T = TypeVar("T")


def redis_client() -> Redis | None:
    try:
        return Redis.from_url(get_settings().redis_url, decode_responses=True, socket_connect_timeout=1)
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
        client.setex(key, ttl or get_settings().cache_default_ttl_seconds, json.dumps(value, default=str))
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