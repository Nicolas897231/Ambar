from datetime import UTC, datetime
import base64
import hashlib
import hmac
import secrets

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def _fernet() -> Fernet:
    settings = get_settings()
    key_material = settings.webhook_secret_encryption_key or settings.jwt_secret_key
    derived = hashlib.sha256(key_material.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_text(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_text(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Invalid encrypted secret") from exc


def sign_payload(secret: str, timestamp: str, body: str) -> str:
    message = f"{timestamp}.{body}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_signature(secret: str, timestamp: str, body: str, signature: str) -> bool:
    expected = sign_payload(secret, timestamp, body)
    return hmac.compare_digest(expected, signature)


def verify_signed_payload(secret: str, timestamp: str, body: str, signature: str, tolerance_seconds: int | None = None) -> bool:
    if not timestamp or not signature:
        return False
    try:
        timestamp_value = int(timestamp)
    except ValueError:
        return False
    now = int(datetime.now(UTC).timestamp())
    tolerance = tolerance_seconds if tolerance_seconds is not None else get_settings().webhook_signature_tolerance_seconds
    if abs(now - timestamp_value) > tolerance:
        return False
    return verify_signature(secret, timestamp, body, signature)