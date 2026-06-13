from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.main import app


def _headers(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_phase2_workflow_hr_report_flow():
    with TestClient(app) as client:
        headers = _headers(client)

        workflows = client.get("/api/v1/workflows", headers=headers)
        assert workflows.status_code == 200
        workflow_id = workflows.json()[0]["idWorkflow"]

        started = client.post(
            f"/api/v1/workflows/{workflow_id}/start",
            json={
                "entity_type": "employee",
                "entity_id": "9001",
                "assignee_identification": "1000000000",
            },
            headers=headers,
        )
        assert started.status_code == 201, started.text

        tasks = client.get("/api/v1/workflows/tasks", headers=headers)
        assert tasks.status_code == 200
        assert tasks.json()
        task_id = tasks.json()[0]["idTask"]

        rejected_without_reason = client.patch(
            f"/api/v1/workflows/tasks/{task_id}",
            json={"status": "rejected", "evidence": {"source": "test"}},
            headers=headers,
        )
        assert rejected_without_reason.status_code == 422

        approved = client.patch(
            f"/api/v1/workflows/tasks/{task_id}",
            json={"status": "approved", "evidence": {"source": "test"}},
            headers=headers,
        )
        assert approved.status_code == 200, approved.text

        active_tasks = client.get("/api/v1/workflows/tasks", headers=headers)
        assert active_tasks.status_code == 200
        assert all(item["idTask"] != task_id for item in active_tasks.json())

        approved_tasks = client.get("/api/v1/workflows/tasks?status=approved", headers=headers)
        assert approved_tasks.status_code == 200
        assert any(item["idTask"] == task_id for item in approved_tasks.json())

        employee = client.post(
            "/api/v1/hr/employees",
            json={
                "identification": "900100",
                "employee_code": "EMP-900100",
                "full_name": "Empleado Fase Dos",
                "position": "Analista documental",
                "department": "Archivo",
                "hire_date": datetime.now(UTC).isoformat(),
            },
            headers=headers,
        )
        assert employee.status_code in {201, 409}

        invalid_employee = client.post(
            "/api/v1/hr/employees",
            json={
                "identification": "Empleado Sin Documento",
                "employee_code": "EMP-BAD-NAME",
                "full_name": "123456",
                "position": "Analista documental",
                "department": "Archivo",
                "hire_date": datetime.now(UTC).isoformat(),
            },
            headers=headers,
        )
        assert invalid_employee.status_code == 422

        compliance = client.get("/api/v1/hr/employees/900100/compliance", headers=headers)
        assert compliance.status_code == 200
        assert "missing_files" in compliance.json()

        report = client.post("/api/v1/reports/jobs", json={"report_type": "operational"}, headers=headers)
        assert report.status_code == 201, report.text
        assert report.json()["status"] == "completed"

        advanced = client.get("/api/v1/analytics/advanced", headers=headers)
        assert advanced.status_code == 200
        assert "pending_tasks" in advanced.json()
