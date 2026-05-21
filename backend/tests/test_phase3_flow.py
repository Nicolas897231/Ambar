from fastapi.testclient import TestClient

from app.main import app


def _headers(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_phase3_health_search_platform_metrics_flow():
    with TestClient(app) as client:
        headers = _headers(client)

        live = client.get("/health/live")
        assert live.status_code == 200
        assert live.json()["status"] == "alive"

        ready = client.get("/health/ready")
        assert ready.status_code == 200
        assert "mysql_primary" in ready.json()["checks"]

        search = client.post(
            "/api/v1/search/documents",
            json={"q": "", "page": 1, "size": 10},
            headers=headers,
        )
        assert search.status_code == 200, search.text
        assert search.json()["engine"] in {"mysql_fallback", "opensearch"}
        if search.json()["engine"] == "mysql_fallback":
            assert search.json()["total"] > 0
            assert {"entity_type", "title", "url"}.issubset(search.json()["items"][0])

        platform = client.get("/api/v1/platform/technical-dashboard", headers=headers)
        assert platform.status_code == 200, platform.text
        assert "requests_recorded" in platform.json()

        metrics = client.get("/metrics")
        assert metrics.status_code == 200
        assert "ambar_http_requests_total" in metrics.text
