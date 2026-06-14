from datetime import UTC, datetime, timedelta
import base64
import hashlib
import hmac
import secrets
import struct
from typing import Any
from uuid import uuid4
from urllib.parse import quote

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

# Hash dummy precalculado para ejecutar bcrypt incluso cuando el usuario no existe,
# nivelando el tiempo de respuesta y previniendo enumeración de usuarios por timing.
_DUMMY_HASH = bcrypt.hashpw(b"ambar-timing-guard-dummy", bcrypt.gensalt(rounds=12)).decode("utf-8")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def verify_password_timing_safe(password: str, password_hash: str | None) -> bool:
    """Siempre ejecuta bcrypt aunque el hash sea None, evitando timing attacks
    que permitan enumerar usuarios válidos por diferencia de tiempo de respuesta."""
    if password_hash is None:
        bcrypt.checkpw(password.encode("utf-8"), _DUMMY_HASH.encode("utf-8"))
        return False
    return verify_password(password, password_hash)


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


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("utf-8").rstrip("=")


def _totp_code(secret: str, counter: int, digits: int = 6) -> str:
    padding = "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode((secret + padding).upper())
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(number % (10**digits)).zfill(digits)


def verify_totp(secret: str, code: str, window: int = 1) -> bool:
    if not code or not code.isdigit():
        return False
    counter = int(datetime.now(UTC).timestamp() // 30)
    return any(hmac.compare_digest(_totp_code(secret, counter + drift), code.zfill(6)) for drift in range(-window, window + 1))


def totp_uri(secret: str, email: str, issuer: str = "AMBAR") -> str:
    return f"otpauth://totp/{quote(issuer)}:{quote(email)}?secret={secret}&issuer={quote(issuer)}&digits=6&period=30"
