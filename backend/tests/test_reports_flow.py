from fastapi.testclient import TestClient

from app.main import app


def _headers(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_reports_jobs_create_list_and_download():
    with TestClient(app) as client:
        headers = _headers(client)

        created = client.post(
            "/api/v1/reports/jobs",
            json={"report_type": "operational"},
            headers=headers,
        )
        assert created.status_code == 201, created.text
        job = created.json()
        assert job["status"] == "completed"
        assert job["generated_file"]

        listed = client.get("/api/v1/reports/jobs", headers=headers)
        assert listed.status_code == 200, listed.text
        assert any(item["idJob"] == job["idJob"] for item in listed.json())

        downloaded = client.get(f"/api/v1/reports/jobs/{job['idJob']}/download", headers=headers)
        assert downloaded.status_code == 200, downloaded.text
        assert downloaded.headers["content-type"].startswith("text/csv")
        assert "attachment" in downloaded.headers["content-disposition"]
        assert "metric,value" in downloaded.text
        assert job["generated_file"] not in downloaded.text


def test_reports_reject_invalid_type():
    with TestClient(app) as client:
        headers = _headers(client)
        response = client.post(
            "/api/v1/reports/jobs",
            json={"report_type": "invalid"},
            headers=headers,
        )
        assert response.status_code == 422
