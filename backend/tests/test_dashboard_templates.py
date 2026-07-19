from fastapi.testclient import TestClient

from app.main import app


def _auth_headers(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_dashboard_templates_and_custom_layout():
    with TestClient(app) as client:
        headers = _auth_headers(client)

        templates = client.get("/api/v1/analytics/templates", headers=headers)
        assert templates.status_code == 200, templates.text
        payload = templates.json()
        assert payload["templates"]
        assert any(item["layout_name"] == "operational" for item in payload["templates"])

        saved = client.put(
            "/api/v1/analytics/layout",
            json={
                "layout_name": "operational-archivo",
                "widgets": ["operational_queue", "document_kpis", "alerts"],
                "is_default": False,
            },
            headers=headers,
        )
        assert saved.status_code == 200, saved.text
        assert saved.json()["layout_name"] == "operational-archivo"

        layouts = client.get("/api/v1/analytics/layouts", headers=headers)
        assert layouts.status_code == 200, layouts.text
        assert any(item["layout_name"] == "operational-archivo" for item in layouts.json()["layouts"])
