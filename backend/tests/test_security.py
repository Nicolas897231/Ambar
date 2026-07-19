from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.security import enforce_password_policy
from app.main import app
from app.services.crypto import sign_payload


def test_password_policy_accepts_strong_password():
    enforce_password_policy("AmbarVault2026!Z")


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


def test_password_change_required_and_forgot_password_cycle():
    suffix = uuid4().hex[:8]
    identification = str(uuid4().int)[:10]
    email = f"pwd-cycle-{suffix}@ambar.co"
    new_password = f"AmbarVault{suffix.upper()}!7"

    with TestClient(app) as client:
        headers = _headers(client)
        created = client.post(
            "/api/v1/users",
            json={
                "identification": identification,
                "name": "Usuario Cambio Clave",
                "email": email,
                "role_names": ["viewer"],
                "company_id": "default",
                "location_id": 1,
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        assert created.json()["password_change_required"] is True

        first_login = client.post("/api/v1/auth/login", json={"email": email, "password": identification})
        assert first_login.status_code == 200, first_login.text
        user_headers = {"Authorization": f"Bearer {first_login.json()['access_token']}"}
        session = client.get("/api/v1/auth/session", headers=user_headers)
        assert session.status_code == 200, session.text
        assert session.json()["user"]["password_change_required"] is True

        changed = client.post(
            "/api/v1/auth/password/change",
            json={
                "current_password": identification,
                "new_password": new_password,
                "confirm_password": new_password,
            },
            headers=user_headers,
        )
        assert changed.status_code == 200, changed.text
        assert changed.json()["ok"] is True

        after_change = client.get("/api/v1/auth/session", headers=user_headers)
        assert after_change.status_code == 200, after_change.text
        assert after_change.json()["user"]["password_change_required"] is False

        new_login = client.post("/api/v1/auth/login", json={"email": email, "password": new_password})
        assert new_login.status_code == 200, new_login.text

        forgot = client.post("/api/v1/auth/password/forgot", json={"email": email})
        assert forgot.status_code == 200, forgot.text
        assert forgot.json()["ok"] is True

        reset_login = client.post("/api/v1/auth/login", json={"email": email, "password": identification})
        assert reset_login.status_code == 200, reset_login.text
        reset_headers = {"Authorization": f"Bearer {reset_login.json()['access_token']}"}
        reset_session = client.get("/api/v1/auth/session", headers=reset_headers)
        assert reset_session.status_code == 200, reset_session.text
        assert reset_session.json()["user"]["password_change_required"] is True
