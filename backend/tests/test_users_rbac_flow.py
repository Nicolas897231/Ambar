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
