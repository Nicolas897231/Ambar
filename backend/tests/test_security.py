from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.security import enforce_password_policy
from app.main import app
from app.services.crypto import sign_payload


def test_password_policy_accepts_strong_password():
    enforce_password_policy("ChangeMe123!")


def test_password_policy_rejects_weak_password():
    with pytest.raises(ValueError):
        enforce_password_policy("weak")


def test_production_configuration_rejects_default_secrets():
    with pytest.raises(ValueError):
        Settings(environment="production")


def _headers(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_webhook_incoming_accepts_returned_secret_and_rejects_replay_window():
    with TestClient(app) as client:
        headers = _headers(client)
        suffix = int(datetime.now(UTC).timestamp())
        created = client.post(
            "/api/v1/webhooks/endpoints",
            json={
                "endpoint_name": f"Seguridad Webhook {suffix}",
                "target_url": "https://example.com/secure-webhook",
                "event_type": "security.test",
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        endpoint_id = created.json()["endpoint"]["idEndpoint"]
        secret = created.json()["secret"]
        body = '{"ok":true}'
        timestamp = str(int(datetime.now(UTC).timestamp()))
        signature = sign_payload(secret, timestamp, body)

        accepted = client.post(
            f"/api/v1/webhooks/incoming/{endpoint_id}",
            content=body,
            headers={"X-Ambar-Timestamp": timestamp, "X-Ambar-Signature": signature, "Content-Type": "application/json"},
        )
        assert accepted.status_code == 200, accepted.text

        old_timestamp = str(int((datetime.now(UTC) - timedelta(minutes=30)).timestamp()))
        old_signature = sign_payload(secret, old_timestamp, body)
        rejected = client.post(
            f"/api/v1/webhooks/incoming/{endpoint_id}",
            content=body,
            headers={"X-Ambar-Timestamp": old_timestamp, "X-Ambar-Signature": old_signature, "Content-Type": "application/json"},
        )
        assert rejected.status_code == 403

def test_login_sets_httponly_cookie_and_cookie_auth_works():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
        )
        assert response.status_code == 200, response.text
        assert "ambar_access_token" in response.cookies
        assert "httponly" in response.headers.get("set-cookie", "").lower()

        me = client.get("/api/v1/auth/me")
        assert me.status_code == 200, me.text
        assert me.json()["email"] == "admin@ambar.co"


def test_session_status_is_silent_without_cookie_and_reports_authenticated_user():
    with TestClient(app) as client:
        anonymous = client.get("/api/v1/auth/session")
        assert anonymous.status_code == 200, anonymous.text
        assert anonymous.json() == {"authenticated": False, "user": None}

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
        )
        assert login.status_code == 200, login.text

        session = client.get("/api/v1/auth/session")
        assert session.status_code == 200, session.text
        body = session.json()
        assert body["authenticated"] is True
        assert body["user"]["email"] == "admin@ambar.co"
