from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


def _headers(client: TestClient) -> dict:
    response = client.post("/api/v1/auth/login", json={"email": "admin@ambar.co", "password": "ChangeMe123!"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_archival_document_upload_repository_and_kardex_flow():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)

        archives = client.get("/api/v1/archives", headers=headers)
        assert archives.status_code == 200, archives.text
        archive_id = archives.json()[0]["idArchive"]

        expedient = client.post(
            "/api/v1/archives/expedients",
            json={
                "archive_id": archive_id,
                "expedient_code": f"EXP-QA-{suffix}",
                "expedient_name": "Expediente QA SGDEA",
                "expedient_type": "administrativo",
            },
            headers=headers,
        )
        assert expedient.status_code == 201, expedient.text
        expedient_id = expedient.json()["idExpedient"]

        folder = client.post(
            "/api/v1/archives/folders",
            json={"expedient_id": expedient_id, "folder_code": f"CARP-{suffix}", "folder_name": "Carpeta QA SGDEA"},
            headers=headers,
        )
        assert folder.status_code == 201, folder.text
        folder_id = folder.json()["idFolder"]

        document = client.post(
            "/api/v1/documents",
            json={
                "document_name": "Documento SGDEA con repositorio",
                "document_type": "informe",
                "archive_id": archive_id,
                "expedient_id": expedient_id,
                "folder_id": folder_id,
                "folio_start": 1,
                "folio_end": 3,
                "metadata": {"qa": True},
            },
            headers=headers,
        )
        assert document.status_code == 201, document.text
        document_id = document.json()["idDocument"]
        assert document.json()["archive_id"] == archive_id
        assert document.json()["folio_total"] == 3

        uploaded = client.post(
            f"/api/v1/documents/{document_id}/files",
            files={"file": ("evidencia.txt", b"contenido documental", "text/plain")},
            headers=headers,
        )
        assert uploaded.status_code == 201, uploaded.text
        assert uploaded.json()["original_name"] == "evidencia.txt"
        assert uploaded.json()["url"]

        files = client.get(f"/api/v1/documents/{document_id}/files", headers=headers)
        assert files.status_code == 200, files.text
        assert any(item["original_name"] == "evidencia.txt" for item in files.json())

        movement = client.post(
            "/api/v1/archives/kardex",
            json={
                "movement_type": "transfer",
                "entity_type": "folder",
                "entity_id": folder_id,
                "origin_archive_id": archive_id,
                "destination_archive_id": archive_id,
                "observations": "Transferencia QA",
            },
            headers=headers,
        )
        assert movement.status_code == 201, movement.text
        rejected = client.patch(
            f"/api/v1/archives/kardex/{movement.json()['idMovement']}/decision",
            json={"status": "rejected", "reason": "faltan_folios"},
            headers=headers,
        )
        assert rejected.status_code == 200, rejected.text
        assert rejected.json()["reason"] == "faltan_folios"
