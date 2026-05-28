from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _headers(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_users_roles_permissions_and_soft_deactivation_flow():
    suffix = uuid4().hex[:8]
    role_name = f"kardex_tester_{suffix}"
    identification = f"qa{suffix}"
    email = f"qa-{suffix}@ambar.co"

    with TestClient(app) as client:
        headers = _headers(client)

        permissions = client.get("/api/v1/users/permissions", headers=headers)
        assert permissions.status_code == 200, permissions.text
        keys = {item["permission_key"] for item in permissions.json()}
        assert {"document.read", "document.transfer", "task.manage"}.issubset(keys)

        created_role = client.post(
            "/api/v1/users/roles",
            json={
                "role_name": role_name,
                "description": "Rol QA para documentos, kardex y tareas",
                "permissions": ["document.read", "document.transfer", "task.manage"],
            },
            headers=headers,
        )
        assert created_role.status_code == 201, created_role.text
        role = created_role.json()
        assert role["role_name"] == role_name
        assert sorted(role["permissions"]) == ["document.read", "document.transfer", "task.manage"]

        patched_role = client.patch(
            f"/api/v1/users/roles/{role['idRole']}",
            json={"permissions": ["document.read", "document.transfer", "task.manage", "notification.read"]},
            headers=headers,
        )
        assert patched_role.status_code == 200, patched_role.text
        assert "notification.read" in patched_role.json()["permissions"]

        created_user = client.post(
            "/api/v1/users",
            json={
                "identification": identification,
                "name": "Usuario QA RBAC",
                "email": email,
                "password": "RoleUser123!",
                "role_names": [role_name],
                "company_id": "default",
                "location_id": 1,
            },
            headers=headers,
        )
        assert created_user.status_code == 201, created_user.text
        user = created_user.json()
        assert user["status"] == "active"
        assert user["roles"] == [role_name]
        assert "task.manage" in user["permissions"]
        assert "users.manage" not in user["permissions"]

        user_login = client.post("/api/v1/auth/login", json={"email": email, "password": "RoleUser123!"})
        assert user_login.status_code == 200, user_login.text
        user_headers = {"Authorization": f"Bearer {user_login.json()['access_token']}"}
        me = client.get("/api/v1/auth/me", headers=user_headers)
        assert me.status_code == 200, me.text
        assert me.json()["roles"] == [role_name]
        assert set(me.json()["permissions"]) == {"document.read", "document.transfer", "notification.read", "task.manage"}

        deactivated = client.delete(f"/api/v1/users/{identification}", headers=headers)
        assert deactivated.status_code == 200, deactivated.text
        assert deactivated.json()["status"] == "inactive"

        active_users = client.get("/api/v1/users", headers=headers)
        assert active_users.status_code == 200, active_users.text
        assert all(item["identification"] != identification for item in active_users.json())

        all_users = client.get("/api/v1/users?include_inactive=true", headers=headers)
        assert all_users.status_code == 200, all_users.text
        assert any(item["identification"] == identification and item["status"] == "inactive" for item in all_users.json())

        blocked_login = client.post("/api/v1/auth/login", json={"email": email, "password": "RoleUser123!"})
        assert blocked_login.status_code == 401


def test_enterprise_admin_trd_hr_and_password_feedback():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)

        weak_user = client.post(
            "/api/v1/users",
            json={
                "identification": f"weak{suffix}",
                "name": "Usuario Password Debil",
                "email": f"weak-{suffix}@ambar.co",
                "password": "as400181*",
                "role_names": ["archive_analyst"],
                "company_id": "default",
                "location_id": 1,
            },
            headers=headers,
        )
        assert weak_user.status_code == 422
        assert "at least 12" in weak_user.json()["detail"]

        series = client.post(
            "/api/v1/trd/series",
            json={"code": f"QA-{suffix}", "name": "Serie QA Produccion"},
            headers=headers,
        )
        assert series.status_code == 201, series.text
        subseries = client.post(
            "/api/v1/trd/subseries",
            json={"series_id": series.json()["idSeries"], "name": "Subserie QA Produccion", "retention_years": 5},
            headers=headers,
        )
        assert subseries.status_code == 201, subseries.text
        retention = client.patch(
            f"/api/v1/trd/subseries/{subseries.json()['idSubseries']}/retention",
            json={"retention_years": 8},
            headers=headers,
        )
        assert retention.status_code == 200, retention.text
        assert retention.json()["retention_years"] == 8
        disposition = client.post(
            "/api/v1/trd/dispositions",
            json={"subseries_id": subseries.json()["idSubseries"], "archive_management": 2, "archive_central": 6, "final_action": "Conservacion total"},
            headers=headers,
        )
        assert disposition.status_code == 201, disposition.text

        position = client.post(
            "/api/v1/hr/positions",
            json={
                "position_code": f"POS-{suffix}",
                "name": "Coordinador documental QA",
                "level": "coordinacion",
                "department": "Archivo",
                "required_documents": ["hoja_vida", "contrato_firmado"],
                "suggested_permissions": ["document.read"],
            },
            headers=headers,
        )
        assert position.status_code == 201, position.text
        positions = client.get("/api/v1/hr/positions", headers=headers)
        assert positions.status_code == 200, positions.text
        assert any(item["position_code"] == f"POS-{suffix}" for item in positions.json())
