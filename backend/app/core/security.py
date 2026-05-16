from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_token(subject: str, token_type: str, minutes: int | None = None, days: int | None = None, **claims: Any) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expires = now + (timedelta(days=days) if days else timedelta(minutes=minutes or 15))
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": expires,
        "jti": str(uuid4()),
        **claims,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise ValueError("Invalid token") from exc


def enforce_password_policy(password: str) -> None:
    if len(password) < 12:
        raise ValueError("Password must have at least 12 characters")
    if len(password.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 bytes")
    checks = [
        any(char.isupper() for char in password),
        any(char.islower() for char in password),
        any(char.isdigit() for char in password),
        any(not char.isalnum() for char in password),
    ]
    if not all(checks):
        raise ValueError("Password must include upper, lower, number and symbol")
