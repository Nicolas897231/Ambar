from fastapi.testclient import TestClient

from app.main import app


def _tokens(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_phase1_auth_document_dashboard_flow():
    with TestClient(app) as client:
        tokens = _tokens(client)
        headers = {"Authorization": f"Bearer {tokens['access_token']}"}

        me = client.get("/api/v1/auth/me", headers=headers)
        assert me.status_code == 200
        assert "*" in me.json()["permissions"]

        document = client.post(
            "/api/v1/documents",
            json={
                "document_name": "Contrato prueba automatizada",
                "document_type": "contrato",
                "metadata": {"origen": "pytest"},
                "location_id": 1,
            },
            headers=headers,
        )
        assert document.status_code == 201, document.text
        document_id = document.json()["idDocument"]

        documents = client.get("/api/v1/documents", headers=headers)
        assert documents.status_code == 200
        assert any(item["idDocument"] == document_id for item in documents.json())

        dashboard = client.get("/api/v1/analytics/dashboard", headers=headers)
        assert dashboard.status_code == 200
        assert dashboard.json()["total_documents"] >= 1
