from fastapi.testclient import TestClient

from app.main import app


def _headers(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@ambar.co", "password": "ChangeMe123!"},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _document(client: TestClient, headers: dict) -> int:
    response = client.post(
        "/api/v1/documents",
        json={
            "document_name": "Contrato Enterprise Plus",
            "document_type": "contrato",
            "metadata": {"fase": "4", "area": "RRHH"},
            "location_id": 1,
        },
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()["idDocument"]


def test_phase4_ocr_signature_integrations_webhooks_bi_flow():
    with TestClient(app) as client:
        headers = _headers(client)
        document_id = _document(client, headers)

        ocr = client.post("/api/v1/ocr/jobs", json={"document_id": document_id}, headers=headers)
        assert ocr.status_code == 201, ocr.text
        job_id = ocr.json()["job"]["idJob"]

        result = client.get(f"/api/v1/ocr/jobs/{job_id}/result", headers=headers)
        assert result.status_code == 200
        assert "Contrato Enterprise Plus" in result.json()["extracted_text"]

        signature = client.post(
            "/api/v1/signatures/requests",
            json={"document_id": document_id, "signer_identification": "1000000000"},
            headers=headers,
        )
        assert signature.status_code == 201, signature.text
        token = signature.json()["signing_token"]
        request_id = signature.json()["request"]["idRequest"]

        completed = client.post(
            f"/api/v1/signatures/requests/{request_id}/complete",
            json={"token": token, "signer_identification": "1000000000", "evidence": {"otp": "validated"}},
            headers=headers,
        )
        assert completed.status_code == 200, completed.text

        integration = client.post(
            "/api/v1/integrations",
            json={"integration_name": f"ERP Pruebas Fase 4 {document_id}", "integration_type": "generic_rest", "config_data": {"base_url": "https://erp.example.com"}},
            headers=headers,
        )
        assert integration.status_code in {201, 409}
        integration_id = integration.json()["idIntegration"] if integration.status_code == 201 else 1

        sync = client.post(
            f"/api/v1/integrations/{integration_id}/sync",
            json={"entity_type": "document", "entity_id": str(document_id), "payload": {"document_id": document_id}},
            headers=headers,
        )
        assert sync.status_code == 201, sync.text

        ingest = client.post(
            "/api/v1/integrations",
            json={
                "integration_name": f"Ingreso documental Fase 4 {document_id}",
                "integration_type": "document_ingest",
                "config_data": {
                    "direction": "receive",
                    "http_method": "POST",
                    "endpoint_path": "/external/documents",
                    "auth": {"type": "bearer", "secret_ref": "AMBAR_INGEST_TOKEN"},
                },
            },
            headers=headers,
        )
        assert ingest.status_code == 201, ingest.text
        assert ingest.json()["config_data"]["direction"] == "receive"
        assert ingest.json()["config_data"]["auth"]["secret_ref"] == "AMBAR_INGEST_TOKEN"

        ingest_sync = client.post(
            f"/api/v1/integrations/{ingest.json()['idIntegration']}/sync",
            json={"entity_type": "document", "entity_id": str(document_id), "payload": {"document_id": document_id}},
            headers=headers,
        )
        assert ingest_sync.status_code == 201, ingest_sync.text
        log_payload = ingest_sync.json()["request_payload"]
        assert log_payload["direction"] == "receive"
        assert log_payload["http_method"] == "POST"
        assert "AMBAR_INGEST_TOKEN" == log_payload["auth"]["secret_ref"]
        assert "secret_value" not in log_payload["auth"]

        webhook = client.post(
            "/api/v1/webhooks/endpoints",
            json={"endpoint_name": f"Webhook Fase 4 {document_id}", "target_url": "https://example.com/webhook", "event_type": "ocr.completed"},
            headers=headers,
        )
        assert webhook.status_code == 201, webhook.text

        emitted = client.post(
            "/api/v1/webhooks/emit",
            json={"event_type": "ocr.completed", "payload": {"job_id": job_id}},
            headers=headers,
        )
        assert emitted.status_code == 201

        refresh = client.post("/api/v1/bi/refresh", headers=headers)
        assert refresh.status_code == 200, refresh.text

        dashboard = client.get("/api/v1/bi/executive-dashboard", headers=headers)
        assert dashboard.status_code == 200
        assert "ocr_success_rate" in dashboard.json()
