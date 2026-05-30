from uuid import uuid4
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.main import app


def _headers(client: TestClient) -> dict:
    response = client.post("/api/v1/auth/login", json={"email": "admin@ambar.co", "password": "ChangeMe123!"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_expedient_and_folder(client: TestClient, headers: dict, suffix: str) -> tuple[int, int, int]:
    archives = client.get("/api/v1/archives", headers=headers)
    assert archives.status_code == 200, archives.text
    archive_id = archives.json()[0]["idArchive"]
    series = client.get("/api/v1/trd/series", headers=headers)
    subseries = client.get("/api/v1/trd/subseries", headers=headers)
    assert series.status_code == 200, series.text
    assert subseries.status_code == 200, subseries.text
    expedient = client.post(
        "/api/v1/archives/expedients",
        json={
            "archive_id": archive_id,
            "expedient_code": f"EXP-QA-{suffix}",
            "expedient_name": "Expediente QA SGDEA",
            "expedient_type": "administrativo",
            "series_id": series.json()[0]["idSeries"],
            "subseries_id": subseries.json()[0]["idSubseries"],
        },
        headers=headers,
    )
    assert expedient.status_code == 201, expedient.text
    folder = client.post(
        "/api/v1/archives/folders",
        json={"expedient_id": expedient.json()["idExpedient"], "folder_code": f"CARP-{suffix}", "folder_name": "Carpeta QA SGDEA"},
        headers=headers,
    )
    assert folder.status_code == 201, folder.text
    return archive_id, expedient.json()["idExpedient"], folder.json()["idFolder"]


def _create_document(client: TestClient, headers: dict, archive_id: int, expedient_id: int, folder_id: int, suffix: str, start: int = 1, end: int = 1) -> int:
    subseries = client.get("/api/v1/trd/subseries", headers=headers)
    assert subseries.status_code == 200, subseries.text
    document = client.post(
        "/api/v1/documents",
        json={
            "document_name": f"Documento expediente vivo {suffix}",
            "document_type": "acta",
            "archive_id": archive_id,
            "expedient_id": expedient_id,
            "folder_id": folder_id,
            "subseries_id": subseries.json()[0]["idSubseries"],
            "folio_start": start,
            "folio_end": end,
        },
        headers=headers,
    )
    assert document.status_code == 201, document.text
    return document.json()["idDocument"]


def test_archival_document_upload_repository_and_kardex_flow():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)

        archives = client.get("/api/v1/archives", headers=headers)
        assert archives.status_code == 200, archives.text
        archive_id = archives.json()[0]["idArchive"]
        series = client.get("/api/v1/trd/series", headers=headers)
        subseries = client.get("/api/v1/trd/subseries", headers=headers)
        assert series.status_code == 200, series.text
        assert subseries.status_code == 200, subseries.text
        series_id = series.json()[0]["idSeries"]
        subseries_id = subseries.json()[0]["idSubseries"]

        expedient = client.post(
            "/api/v1/archives/expedients",
            json={
                "archive_id": archive_id,
                "expedient_code": f"EXP-QA-{suffix}",
                "expedient_name": "Expediente QA SGDEA",
                "expedient_type": "administrativo",
                "series_id": series_id,
                "subseries_id": subseries_id,
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
                "subseries_id": subseries_id,
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
        download = client.get(f"/api/v1/archives/repository/files/{files.json()[0]['idFile']}/download", headers=headers)
        assert download.status_code == 200, download.text
        assert download.json()["download_url"]
        assert download.json()["checksum"] == files.json()[0]["checksum"]

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


def test_phase2_document_core_types_metadata_versions_and_trd_workspace():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"CORE-{suffix}")

        doc_type = client.post(
            "/api/v1/documents/types",
            json={
                "type_code": f"core_{suffix}",
                "name": "Tipologia Core QA",
                "required_metadata": ["radicado"],
                "optional_metadata": ["asunto"],
            },
            headers=headers,
        )
        assert doc_type.status_code == 201, doc_type.text

        missing_metadata = client.post(
            "/api/v1/documents",
            json={
                "document_name": "Documento sin metadata obligatoria",
                "document_type": f"core_{suffix}",
                "archive_id": archive_id,
                "expedient_id": expedient_id,
                "folder_id": folder_id,
                "metadata": {},
            },
            headers=headers,
        )
        assert missing_metadata.status_code == 422

        subseries = client.get("/api/v1/trd/subseries", headers=headers)
        created = client.post(
            "/api/v1/documents",
            json={
                "document_name": f"Documento core SGDEA {suffix}",
                "document_type": f"core_{suffix}",
                "archive_id": archive_id,
                "expedient_id": expedient_id,
                "folder_id": folder_id,
                "subseries_id": subseries.json()[0]["idSubseries"],
                "folio_start": 1,
                "folio_end": 2,
                "metadata": {"radicado": f"RAD-{suffix}", "asunto": "Nucleo documental"},
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        document_id = created.json()["idDocument"]
        assert created.json()["metadata"]["radicado"] == f"RAD-{suffix}"

        metadata = client.get(f"/api/v1/documents/{document_id}/metadata", headers=headers)
        assert metadata.status_code == 200, metadata.text
        assert "radicado" in metadata.json()["required_metadata"]

        updated_metadata = client.put(
            f"/api/v1/documents/{document_id}/metadata",
            json={"metadata": {"radicado": f"RAD2-{suffix}", "asunto": "Actualizado"}},
            headers=headers,
        )
        assert updated_metadata.status_code == 200, updated_metadata.text
        assert updated_metadata.json()["version"] == 2

        versions = client.get(f"/api/v1/documents/{document_id}/versions", headers=headers)
        assert versions.status_code == 200, versions.text
        assert versions.json()["current_version"] == 2
        assert any(item["action"] == "metadata_updated" for item in versions.json()["history"])

        series = client.get("/api/v1/trd/series/tree", headers=headers)
        assert series.status_code == 200, series.text
        assert series.json()
        workspace = client.get(f"/api/v1/trd/series/{series.json()[0]['idSeries']}/workspace", headers=headers)
        assert workspace.status_code == 200, workspace.text
        assert "kpis" in workspace.json()

        search = client.post(
            "/api/v1/search/documents",
            json={"q": f"Documento core SGDEA {suffix}", "entity_type": "document"},
            headers=headers,
        )
        assert search.status_code == 200, search.text
        assert any(item["id"] == document_id for item in search.json()["items"])


def test_archive_access_denied_for_unassigned_user():
    suffix = uuid4().hex[:8]
    identification = f"viewer{suffix}"
    email = f"viewer-{suffix}@ambar.co"

    with TestClient(app) as client:
        headers = _headers(client)
        archives = client.get("/api/v1/archives", headers=headers)
        assert archives.status_code == 200, archives.text
        archive_id = archives.json()[0]["idArchive"]

        created_user = client.post(
            "/api/v1/users",
            json={
                "identification": identification,
                "name": "Usuario Sin Archivo",
                "email": email,
                "password": "ViewerUser123!",
                "role_names": ["viewer"],
                "company_id": "default",
                "location_id": 1,
            },
            headers=headers,
        )
        assert created_user.status_code == 201, created_user.text
        login = client.post("/api/v1/auth/login", json={"email": email, "password": "ViewerUser123!"})
        assert login.status_code == 200, login.text
        viewer_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        denied_archives = client.get("/api/v1/archives", headers=viewer_headers)
        assert denied_archives.status_code == 200, denied_archives.text
        assert denied_archives.json() == []

        denied_documents = client.get(f"/api/v1/documents?archive_id={archive_id}", headers=viewer_headers)
        assert denied_documents.status_code == 403, denied_documents.text
        denied_balance = client.get(f"/api/v1/kardex/archive/{archive_id}/balance", headers=viewer_headers)
        assert denied_balance.status_code == 403, denied_balance.text


def test_document_loan_return_creates_controlled_flow():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        archive_id, _, folder_id = _create_expedient_and_folder(client, headers, f"LOAN-{suffix}")

        loan = client.post(
            "/api/v1/archives/loans",
            json={
                "archive_id": archive_id,
                "entity_type": "folder",
                "entity_id": folder_id,
                "requested_by": "Inspector QA",
                "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                "observations": "Prestamo funcional QA",
            },
            headers=headers,
        )
        assert loan.status_code == 201, loan.text
        assert loan.json()["status"] == "active"

        returned = client.patch(
            f"/api/v1/archives/loans/{loan.json()['idLoan']}/return",
            json={"observations": "Devuelto sin novedades"},
            headers=headers,
        )
        assert returned.status_code == 200, returned.text
        assert returned.json()["status"] == "returned"

        kardex = client.get("/api/v1/archives/kardex", headers=headers)
        assert kardex.status_code == 200, kardex.text
        assert any(item["movement_type"] == "loan.returned" and item["entity_id"] == folder_id for item in kardex.json())


def test_loans_support_entities_due_evidence_cancel_export_and_transfer_block():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"LEND-{suffix}")
        document_id = _create_document(client, headers, archive_id, expedient_id, folder_id, suffix, start=1, end=2)
        shelf = client.post(
            "/api/v1/archives/shelves",
            json={"archive_id": archive_id, "shelf_code": f"EST-LEND-{suffix}", "shelf_name": "Estanteria prestamos", "capacity_boxes": 3},
            headers=headers,
        )
        assert shelf.status_code == 201, shelf.text
        box = client.post(
            "/api/v1/archives/boxes",
            json={"archive_id": archive_id, "shelf_id": shelf.json()["idShelf"], "box_code": f"BX-LEND-{suffix}", "box_name": "Caja prestamos", "capacity_folders": 5},
            headers=headers,
        )
        assert box.status_code == 201, box.text

        for entity_type, entity_id in [("document", document_id), ("expedient", expedient_id), ("box", box.json()["idBox"])]:
            loan = client.post(
                "/api/v1/archives/loans",
                json={
                    "archive_id": archive_id,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "requested_by": f"Solicitante {entity_type}",
                    "requester_identification": f"ID-{entity_type}-{suffix}",
                    "requester_area": "Calidad",
                    "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                    "reason": "Consulta documental",
                    "delivery_evidence_url": "https://example.test/entrega.pdf",
                },
                headers=headers,
            )
            assert loan.status_code == 201, loan.text
            assert loan.json()["loan_code"].startswith("PR-")
            assert loan.json()["status"] == "active"
            duplicate = client.post(
                "/api/v1/archives/loans",
                json={
                    "archive_id": archive_id,
                    "entity_type": entity_type,
                    "entity_id": entity_id,
                    "requested_by": "Duplicado",
                    "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                },
                headers=headers,
            )
            assert duplicate.status_code == 409, duplicate.text
            returned = client.post(
                f"/api/v1/archives/loans/{loan.json()['idLoan']}/return",
                json={"observations": "Devuelto para liberar flujo", "return_evidence_url": "https://example.test/devolucion.pdf"},
                headers=headers,
            )
            assert returned.status_code == 200, returned.text
            assert returned.json()["status"] == "returned"
            assert returned.json()["return_evidence_url"] == "https://example.test/devolucion.pdf"

        folder_loan = client.post(
            "/api/v1/archives/loans",
            json={
                "archive_id": archive_id,
                "entity_type": "folder",
                "entity_id": folder_id,
                "requested_by": "Area Juridica",
                "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
            },
            headers=headers,
        )
        assert folder_loan.status_code == 201, folder_loan.text
        delivery_evidence = client.post(
            f"/api/v1/archives/loans/{folder_loan.json()['idLoan']}/delivery-evidence",
            json={"evidence_url": "https://example.test/evidencia-entrega.pdf", "observation": "Acta manual"},
            headers=headers,
        )
        assert delivery_evidence.status_code == 200, delivery_evidence.text
        assert delivery_evidence.json()["delivery_evidence_url"] == "https://example.test/evidencia-entrega.pdf"

        destination_archive = client.post(
            "/api/v1/archives",
            json={"archive_code": f"ARCH-LEND-{suffix}", "archive_name": f"Archivo prestamos destino {suffix}", "archive_type": "central", "location_id": 1},
            headers=headers,
        )
        assert destination_archive.status_code == 201, destination_archive.text
        batch = client.post(
            "/api/v1/transfer-batches",
            json={"batch_code": f"TR-LEND-{suffix}", "origin_archive_id": archive_id, "destination_archive_id": destination_archive.json()["idArchive"]},
            headers=headers,
        )
        assert batch.status_code == 201, batch.text
        blocked_transfer = client.post(f"/api/v1/transfer-batches/{batch.json()['idBatch']}/items", json={"entity_type": "folder", "entity_id": folder_id}, headers=headers)
        assert blocked_transfer.status_code == 409, blocked_transfer.text

        cancelled = client.post(f"/api/v1/archives/loans/{folder_loan.json()['idLoan']}/cancel", json={"reason": "Solicitud anulada"}, headers=headers)
        assert cancelled.status_code == 200, cancelled.text
        assert cancelled.json()["status"] == "cancelled"

        due_today = client.post(
            "/api/v1/archives/loans",
            json={
                "archive_id": archive_id,
                "entity_type": "folder",
                "entity_id": folder_id,
                "requested_by": "Vence Hoy",
                "due_at": datetime.now(UTC).isoformat(),
            },
            headers=headers,
        )
        assert due_today.status_code == 201, due_today.text
        assert due_today.json()["status"] == "due_today"

        checked = client.post("/api/v1/archives/loans/check-overdue", headers=headers)
        assert checked.status_code == 200, checked.text
        summary = client.get("/api/v1/archives/loans/summary", headers=headers)
        assert summary.status_code == 200, summary.text
        assert summary.json()["active"] >= 1
        listed = client.get("/api/v1/archives/loans", params={"status_filter": "due_today"}, headers=headers)
        assert listed.status_code == 200, listed.text
        assert any(item["idLoan"] == due_today.json()["idLoan"] for item in listed.json())
        entity_loans = client.get(f"/api/v1/archives/entities/folder/{folder_id}/loans", headers=headers)
        assert entity_loans.status_code == 200, entity_loans.text
        assert any(item["idLoan"] == due_today.json()["idLoan"] for item in entity_loans.json())
        exported = client.get("/api/v1/archives/loans/export", headers=headers)
        assert exported.status_code == 200, exported.text
        assert "loan_code,archive,entity_type" in exported.text

        kardex = client.get(f"/api/v1/kardex/entities/folder/{folder_id}/timeline", headers=headers)
        assert kardex.status_code == 200, kardex.text
        events = {item["event_type"] for item in kardex.json()}
        assert "loan.created" in events
        assert "loan.cancelled" in events


def test_actionable_notifications_and_clean_task_lifecycle():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        archive_id, _, folder_id = _create_expedient_and_folder(client, headers, f"ALERT-{suffix}")
        loan = client.post(
            "/api/v1/archives/loans",
            json={
                "archive_id": archive_id,
                "entity_type": "folder",
                "entity_id": folder_id,
                "requested_by": "Control interno",
                "due_at": datetime.now(UTC).isoformat(),
            },
            headers=headers,
        )
        assert loan.status_code == 201, loan.text
        assert loan.json()["status"] == "due_today"

        rebuilt = client.post("/api/v1/notifications/rebuild-operational-alerts", headers=headers)
        assert rebuilt.status_code == 200, rebuilt.text
        assert rebuilt.json()["created_or_updated"] >= 1
        rebuilt_again = client.post("/api/v1/notifications/rebuild-operational-alerts", headers=headers)
        assert rebuilt_again.status_code == 200, rebuilt_again.text

        notifications = client.get("/api/v1/notifications", headers=headers)
        assert notifications.status_code == 200, notifications.text
        loan_notifications = [item for item in notifications.json() if item["related_entity_type"] == "loan" and item["related_entity_id"] == str(loan.json()["idLoan"])]
        assert loan_notifications
        assert loan_notifications[0]["action_url"] == f"/loans?loan={loan.json()['idLoan']}"
        assert loan_notifications[0]["action_label"] == "Resolver prestamo"

        summary = client.get("/api/v1/notifications/summary", headers=headers)
        assert summary.status_code == 200, summary.text
        assert summary.json()["action_required"] >= 1

        read = client.post(f"/api/v1/notifications/{loan_notifications[0]['idNotification']}/read", headers=headers)
        assert read.status_code == 200, read.text
        assert read.json()["status"] == "read"
        resolved = client.post(f"/api/v1/notifications/{loan_notifications[0]['idNotification']}/resolve", headers=headers)
        assert resolved.status_code == 200, resolved.text
        assert resolved.json()["status"] == "resolved"

        tasks = client.get("/api/v1/workflows/tasks", headers=headers)
        assert tasks.status_code == 200, tasks.text
        loan_tasks = [item for item in tasks.json() if item["related_entity_type"] == "loan" and item["related_entity_id"] == str(loan.json()["idLoan"])]
        assert len(loan_tasks) == 1
        task_id = loan_tasks[0]["idTask"]

        rejected_without_reason = client.post(f"/api/v1/workflows/tasks/{task_id}/reject", json={"status": "rejected", "evidence": {}}, headers=headers)
        assert rejected_without_reason.status_code == 422, rejected_without_reason.text
        started = client.post(f"/api/v1/workflows/tasks/{task_id}/start", headers=headers)
        assert started.status_code == 200, started.text
        assert started.json()["status"] == "in_progress"
        completed = client.post(f"/api/v1/workflows/tasks/{task_id}/complete", json={"status": "completed", "evidence": {"note": "Gestionado"}, "resolution_note": "Gestionado"}, headers=headers)
        assert completed.status_code == 200, completed.text
        assert completed.json()["status"] == "completed"

        active_tasks = client.get("/api/v1/workflows/tasks", headers=headers)
        assert active_tasks.status_code == 200, active_tasks.text
        assert all(item["idTask"] != task_id for item in active_tasks.json())
        completed_tasks = client.get("/api/v1/workflows/tasks", params={"status": "completed"}, headers=headers)
        assert completed_tasks.status_code == 200, completed_tasks.text
        assert any(item["idTask"] == task_id for item in completed_tasks.json())

        audit = client.get("/api/v1/audit/logs", params={"module": "notifications", "action": "notification_resolved"}, headers=headers)
        assert audit.status_code == 200, audit.text
        assert audit.json()


def test_audit_security_filters_export_and_denied_access():
    suffix = uuid4().hex[:8]
    identification = f"secviewer{suffix}"
    email = f"secviewer-{suffix}@ambar.co"
    with TestClient(app) as client:
        headers = _headers(client)
        archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"SEC-{suffix}")
        document_id = _create_document(client, headers, archive_id, expedient_id, folder_id, suffix, start=1, end=1)
        uploaded = client.post(
            f"/api/v1/documents/{document_id}/files",
            files={"file": ("auditoria.txt", b"contenido seguro", "text/plain")},
            headers=headers,
        )
        assert uploaded.status_code == 201, uploaded.text

        updated = client.patch(
            f"/api/v1/documents/{document_id}",
            json={"document_name": f"Documento auditado {suffix}", "metadata": {"token": "no-debe-verse", "visible": "ok"}},
            headers=headers,
        )
        assert updated.status_code == 200, updated.text

        created_user = client.post(
            "/api/v1/users",
            json={
                "identification": identification,
                "name": "Usuario Seguridad",
                "email": email,
                "password": "ViewerUser123!",
                "role_names": ["viewer"],
                "company_id": "default",
                "location_id": 1,
            },
            headers=headers,
        )
        assert created_user.status_code == 201, created_user.text
        login = client.post("/api/v1/auth/login", json={"email": email, "password": "ViewerUser123!"})
        assert login.status_code == 200, login.text
        viewer_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        denied_download = client.get(f"/api/v1/archives/repository/files/{uploaded.json()['idFile']}/download", headers=viewer_headers)
        assert denied_download.status_code == 403, denied_download.text
        denied_document = client.get(f"/api/v1/documents?archive_id={archive_id}", headers=viewer_headers)
        assert denied_document.status_code == 403, denied_document.text

        denied_audit = client.get("/api/v1/audit", params={"result": "denied", "severity": "critical"}, headers=headers)
        assert denied_audit.status_code == 200, denied_audit.text
        assert any(item["action"] in {"permission_denied", "archive_access_denied"} and item["result"] == "denied" for item in denied_audit.json())

        document_audit = client.get("/api/v1/audit", params={"module": "documents", "action": "document_updated", "archive_id": archive_id}, headers=headers)
        assert document_audit.status_code == 200, document_audit.text
        row = next(item for item in document_audit.json() if item["entity_id"] == str(document_id))
        assert row["archive_id"] == archive_id
        assert row["old_values"]
        assert row["new_values"]["metadata"]["token"] == "***redacted***"
        detail = client.get(f"/api/v1/audit/{row['idAudit']}", headers=headers)
        assert detail.status_code == 200, detail.text
        assert detail.json()["entity_label"] == f"Documento auditado {suffix}"

        exported = client.get("/api/v1/audit/export", params={"format": "csv", "module": "documents", "archive_id": archive_id}, headers=headers)
        assert exported.status_code == 200, exported.text
        assert "created_at,user,archive_id,module,action" in exported.text
        export_audit = client.get("/api/v1/audit", params={"module": "audit", "action": "audit_exported"}, headers=headers)
        assert export_audit.status_code == 200, export_audit.text
        assert export_audit.json()

        failed_login = client.post("/api/v1/auth/login", json={"email": email, "password": "WrongPassword123!"})
        assert failed_login.status_code == 401, failed_login.text
        auth_audit = client.get("/api/v1/audit", params={"module": "auth", "action": "login_failed", "result": "failed"}, headers=headers)
        assert auth_audit.status_code == 200, auth_audit.text
        assert auth_audit.json()


def test_fuid_generation_and_csv_export():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        _, expedient_id, _ = _create_expedient_and_folder(client, headers, f"FUID-{suffix}")

        generated = client.post(f"/api/v1/archives/fuid/expedients/{expedient_id}", headers=headers)
        assert generated.status_code == 201, generated.text
        assert generated.json()["ps950IdExpedient"] == expedient_id

        exported = client.get("/api/v1/archives/fuid.csv", headers=headers)
        assert exported.status_code == 200, exported.text
        assert "fuid_code,archive_id,expedient_id" in exported.text
        assert generated.json()["fuid_code"] in exported.text


def test_enriched_fuid_transfer_comparison_evidence_export_and_close():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        origin_archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"FUIDOP-{suffix}")
        document_id = _create_document(client, headers, origin_archive_id, expedient_id, folder_id, suffix, start=1, end=3)
        destination_archive = client.post(
            "/api/v1/archives",
            json={
                "archive_code": f"ARCH-FUID-{suffix}",
                "archive_name": f"Archivo FUID destino {suffix}",
                "archive_type": "central",
                "location_id": 1,
            },
            headers=headers,
        )
        assert destination_archive.status_code == 201, destination_archive.text
        batch = client.post(
            "/api/v1/transfer-batches",
            json={
                "batch_code": f"FUID-TR-{suffix}",
                "origin_archive_id": origin_archive_id,
                "destination_archive_id": destination_archive.json()["idArchive"],
            },
            headers=headers,
        )
        assert batch.status_code == 201, batch.text
        added = client.post(f"/api/v1/transfer-batches/{batch.json()['idBatch']}/items", json={"entity_type": "document", "entity_id": document_id}, headers=headers)
        assert added.status_code == 201, added.text

        generated = client.post(f"/api/v1/archives/fuid/from-transfer/{batch.json()['idBatch']}", headers=headers)
        assert generated.status_code == 201, generated.text
        assert generated.json()["ps1070IdBatch"] == batch.json()["idBatch"]
        assert generated.json()["items_count"] == 1
        fuid_id = generated.json()["idFuid"]

        detail = client.get(f"/api/v1/archives/fuid/{fuid_id}", headers=headers)
        assert detail.status_code == 200, detail.text
        assert detail.json()["metadata"]["items"][0]["documentary_unit_type"] == "document"
        assert detail.json()["metadata"]["items"][0]["total_folios_declared"] == 3

        comparison = client.get(f"/api/v1/archives/fuid/{fuid_id}/compare-reception", headers=headers)
        assert comparison.status_code == 200, comparison.text
        assert comparison.json()["summary"]["pending_review"] == 1

        items = client.get(f"/api/v1/transfer-batches/{batch.json()['idBatch']}/reception/items", headers=headers)
        assert items.status_code == 200, items.text
        accepted = client.post(
            f"/api/v1/transfer-batches/{batch.json()['idBatch']}/reception/items/{items.json()[0]['idBatchItem']}/accept",
            json={"received_folios": 3, "received_quantity": 1, "observation": "Recibido completo"},
            headers=headers,
        )
        assert accepted.status_code == 200, accepted.text

        comparison_after = client.get(f"/api/v1/archives/fuid/{fuid_id}/compare-reception", headers=headers)
        assert comparison_after.status_code == 200, comparison_after.text
        assert comparison_after.json()["summary"]["match"] == 1

        delivery = client.post(f"/api/v1/archives/fuid/{fuid_id}/delivery-evidence", json={"observation": "Acta de entrega", "evidence_url": "https://example.test/entrega.pdf"}, headers=headers)
        assert delivery.status_code == 200, delivery.text
        assert delivery.json()["delivery_evidence_count"] == 1
        reception = client.post(f"/api/v1/archives/fuid/{fuid_id}/reception-evidence", json={"observation": "Acta de recibo", "evidence_url": "https://example.test/recibo.pdf", "result": "accepted"}, headers=headers)
        assert reception.status_code == 200, reception.text
        assert reception.json()["reception_evidence_count"] == 1

        exported_csv = client.get(f"/api/v1/archives/fuid/{fuid_id}/export", params={"format": "csv"}, headers=headers)
        assert exported_csv.status_code == 200, exported_csv.text
        assert "order_number,unit_type" in exported_csv.text
        exported_xlsx = client.get(f"/api/v1/archives/fuid/{fuid_id}/export", params={"format": "xlsx"}, headers=headers)
        assert exported_xlsx.status_code == 200, exported_xlsx.text
        assert exported_xlsx.content.startswith(b"PK")

        regenerated = client.post(f"/api/v1/archives/fuid/{fuid_id}/regenerate", json={"reason": "Actualizacion QA"}, headers=headers)
        assert regenerated.status_code == 200, regenerated.text
        assert regenerated.json()["version"] == 2
        versions = client.get(f"/api/v1/archives/fuid/{fuid_id}/versions", headers=headers)
        assert versions.status_code == 200, versions.text
        assert versions.json()

        closed = client.post(f"/api/v1/archives/fuid/{fuid_id}/close", json={"observation": "Cierre FUID QA"}, headers=headers)
        assert closed.status_code == 200, closed.text
        assert closed.json()["status"] == "closed"
        kardex = client.get(f"/api/v1/archives/fuid/{fuid_id}/kardex", headers=headers)
        assert kardex.status_code == 200, kardex.text
        assert any(item["movement_type"] == "fuid.closed" for item in kardex.json())


def test_live_expedient_detail_tree_compliance_and_close():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"LIVE-{suffix}")
        document_id = _create_document(client, headers, archive_id, expedient_id, folder_id, suffix, start=1, end=4)
        shelf = client.post(
            "/api/v1/archives/shelves",
            json={"archive_id": archive_id, "shelf_code": f"EST-LIVE-{suffix}", "shelf_name": "Estanteria cierre QA", "capacity_boxes": 5},
            headers=headers,
        )
        assert shelf.status_code == 201, shelf.text
        box = client.post(
            "/api/v1/archives/boxes",
            json={"archive_id": archive_id, "shelf_id": shelf.json()["idShelf"], "box_code": f"BX-LIVE-{suffix}", "box_name": "Caja cierre QA", "capacity_folders": 5},
            headers=headers,
        )
        assert box.status_code == 201, box.text
        assigned = client.post(f"/api/v1/archives/folders/{folder_id}/assign-location", json={"box_id": box.json()["idBox"]}, headers=headers)
        assert assigned.status_code == 200, assigned.text

        detail = client.get(f"/api/v1/archives/expedients/{expedient_id}/detail", headers=headers)
        assert detail.status_code == 200, detail.text
        assert detail.json()["documents_count"] >= 1
        assert detail.json()["archive_id"] == archive_id

        tree = client.get(f"/api/v1/archives/expedients/{expedient_id}/tree", headers=headers)
        assert tree.status_code == 200, tree.text
        assert tree.json()["children"][0]["children"][0]["id"] == document_id

        compliance = client.get(f"/api/v1/archives/expedients/{expedient_id}/compliance", headers=headers)
        assert compliance.status_code == 200, compliance.text
        assert compliance.json()["ready_to_close"] is True
        assert compliance.json()["foliation"]["status"] == "complete"

        closure_check = client.get(f"/api/v1/archives/expedients/{expedient_id}/closure-check", headers=headers)
        assert closure_check.status_code == 200, closure_check.text
        assert closure_check.json()["closable"] is True

        closed = client.post(f"/api/v1/archives/expedients/{expedient_id}/close", json={"observation": "Cierre QA expediente vivo"}, headers=headers)
        assert closed.status_code == 200, closed.text
        assert closed.json()["status"] == "closed"
        assert closed.json()["closure"]["closed_by"]

        kardex = client.get(f"/api/v1/kardex/entities/expedient/{expedient_id}/timeline", headers=headers)
        assert kardex.status_code == 200, kardex.text
        assert any(item["event_type"] == "expedient.closed" for item in kardex.json())

        audit = client.get(f"/api/v1/archives/expedients/{expedient_id}/audit", headers=headers)
        assert audit.status_code == 200, audit.text
        assert any(item["action"] == "expedient_closed" for item in audit.json())


def test_live_expedient_blocks_close_with_critical_issues_and_active_loan():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"BLOCK-{suffix}")
        _create_document(client, headers, archive_id, expedient_id, folder_id, suffix, start=1, end=2)
        loan = client.post(
            "/api/v1/archives/loans",
            json={
                "archive_id": archive_id,
                "entity_type": "expedient",
                "entity_id": expedient_id,
                "requested_by": "Auditor QA",
                "due_at": (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                "observations": "Prestamo bloqueante",
            },
            headers=headers,
        )
        assert loan.status_code == 201, loan.text

        compliance = client.get(f"/api/v1/archives/expedients/{expedient_id}/compliance", headers=headers)
        assert compliance.status_code == 200, compliance.text
        assert compliance.json()["ready_to_close"] is False
        assert compliance.json()["active_loans"] == 1

        closed = client.post(f"/api/v1/archives/expedients/{expedient_id}/close", json={}, headers=headers)
        assert closed.status_code == 409, closed.text


def test_live_expedient_missing_documents_and_access_denied():
    suffix = uuid4().hex[:8]
    identification = f"expviewer{suffix}"
    email = f"expviewer-{suffix}@ambar.co"
    with TestClient(app) as client:
        headers = _headers(client)
        archives = client.get("/api/v1/archives", headers=headers)
        series = client.get("/api/v1/trd/series", headers=headers)
        subseries = client.get("/api/v1/trd/subseries", headers=headers)
        archive_id = archives.json()[0]["idArchive"]
        expedient = client.post(
            "/api/v1/archives/expedients",
            json={
                "archive_id": archive_id,
                "expedient_code": f"EXP-LAB-{suffix}",
                "expedient_name": "Expediente laboral QA",
                "expedient_type": "laboral",
                "series_id": series.json()[0]["idSeries"],
                "subseries_id": subseries.json()[0]["idSubseries"],
            },
            headers=headers,
        )
        assert expedient.status_code == 201, expedient.text
        missing = client.get(f"/api/v1/archives/expedients/{expedient.json()['idExpedient']}/missing-documents", headers=headers)
        assert missing.status_code == 200, missing.text
        assert "contrato" in missing.json()["missing_documents"]

        created_user = client.post(
            "/api/v1/users",
            json={
                "identification": identification,
                "name": "Usuario Sin Expediente",
                "email": email,
                "password": "ViewerUser123!",
                "role_names": ["viewer"],
                "company_id": "default",
                "location_id": 1,
            },
            headers=headers,
        )
        assert created_user.status_code == 201, created_user.text
        login = client.post("/api/v1/auth/login", json={"email": email, "password": "ViewerUser123!"})
        assert login.status_code == 200, login.text
        viewer_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        denied = client.get(f"/api/v1/archives/expedients/{expedient.json()['idExpedient']}/detail", headers=viewer_headers)
        assert denied.status_code == 403, denied.text


def test_physical_locations_shelves_boxes_moves_and_paths():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"LOC-{suffix}")
        document_id = _create_document(client, headers, archive_id, expedient_id, folder_id, suffix, start=1, end=2)

        shelf_one = client.post(
            "/api/v1/archives/shelves",
            json={"archive_id": archive_id, "shelf_code": f"EST-1-{suffix}", "shelf_name": "Estanteria origen", "capacity_boxes": 2, "physical_location": "Modulo A"},
            headers=headers,
        )
        assert shelf_one.status_code == 201, shelf_one.text
        shelf_two = client.post(
            "/api/v1/archives/shelves",
            json={"archive_id": archive_id, "shelf_code": f"EST-2-{suffix}", "shelf_name": "Estanteria destino", "floor": "Piso 2", "module": "Modulo B", "bay": "Entrepano 4", "capacity_boxes": 2, "physical_location": "Modulo B"},
            headers=headers,
        )
        assert shelf_two.status_code == 201, shelf_two.text

        box = client.post(
            "/api/v1/archives/boxes",
            json={"archive_id": archive_id, "shelf_id": shelf_one.json()["idShelf"], "box_code": f"BX-LOC-{suffix}", "box_name": "Caja ubicacion QA", "capacity_folders": 1},
            headers=headers,
        )
        assert box.status_code == 201, box.text
        assert box.json()["shelf_code"] == shelf_one.json()["shelf_code"]

        assigned = client.post(
            f"/api/v1/archives/folders/{folder_id}/assign-location",
            json={"box_id": box.json()["idBox"], "observation": "Asignacion fisica inicial"},
            headers=headers,
        )
        assert assigned.status_code == 200, assigned.text
        assert f"BX-LOC-{suffix}" in assigned.json()["location_path"]

        contents = client.get(f"/api/v1/archives/boxes/{box.json()['idBox']}/contents", headers=headers)
        assert contents.status_code == 200, contents.text
        assert contents.json()["folders"][0]["idFolder"] == folder_id
        assert contents.json()["box"]["occupancy_percent"] == 100

        moved_box = client.post(
            f"/api/v1/archives/boxes/{box.json()['idBox']}/move",
            json={"shelf_id": shelf_two.json()["idShelf"], "observation": "Reubicacion interna"},
            headers=headers,
        )
        assert moved_box.status_code == 200, moved_box.text
        assert moved_box.json()["shelf_code"] == shelf_two.json()["shelf_code"]

        document_path = client.get(f"/api/v1/archives/entities/document/{document_id}/physical-location", headers=headers)
        assert document_path.status_code == 200, document_path.text
        assert "Piso 2" in document_path.json()["location_path"]
        assert f"EST-2-{suffix}" in document_path.json()["location_path"]
        assert f"BX-LOC-{suffix}" in document_path.json()["location_path"]

        custody = client.get(f"/api/v1/archives/entities/folder/{folder_id}/custody", headers=headers)
        assert custody.status_code == 200, custody.text
        assert custody.json()[0]["archive_id"] == archive_id
        assert f"BX-LOC-{suffix}" in custody.json()[0]["current_location_path"]

        custody_summary = client.get("/api/v1/archives/custody/summary", headers=headers)
        assert custody_summary.status_code == 200, custody_summary.text
        assert custody_summary.json()["current"] >= 1

        current_custody = client.get("/api/v1/archives/custody/current", params={"archive_id": archive_id, "entity_type": "folder"}, headers=headers)
        assert current_custody.status_code == 200, current_custody.text
        assert any(item["entity_id"] == folder_id and item["status"] == "active" for item in current_custody.json())

        summary = client.get("/api/v1/archives/locations/summary", params={"archive_id": archive_id}, headers=headers)
        assert summary.status_code == 200, summary.text
        assert summary.json()["boxes"] >= 1
        assert summary.json()["folders_without_box"] >= 0
        unassigned = client.get("/api/v1/archives/locations/unassigned", params={"archive_id": archive_id}, headers=headers)
        assert unassigned.status_code == 200, unassigned.text
        assert folder_id not in {item["idFolder"] for item in unassigned.json()["folders_without_box"]}

        tree = client.get("/api/v1/archives/locations/tree", params={"archive_id": archive_id}, headers=headers)
        assert tree.status_code == 200, tree.text
        assert tree.json()[0]["shelves"]

        movements = client.get("/api/v1/archives/locations/movements", params={"archive_id": archive_id}, headers=headers)
        assert movements.status_code == 200, movements.text
        movement_types = {item["movement_type"] for item in movements.json()}
        assert "box.moved" in movement_types
        assert "location.assigned" in movement_types

        audit = client.get("/api/v1/audit/logs", params={"module": "archives", "action": "folder_location_changed"}, headers=headers)
        assert audit.status_code == 200, audit.text
        assert audit.json()

        destination_archive = client.post(
            "/api/v1/archives",
            json={
                "archive_code": f"ARCH-LOC-{suffix}",
                "archive_name": f"Archivo bloqueo ubicacion {suffix}",
                "archive_type": "central",
                "location_id": 1,
            },
            headers=headers,
        )
        assert destination_archive.status_code == 201, destination_archive.text
        foreign_shelf = client.post(
            "/api/v1/archives/shelves",
            json={"archive_id": destination_archive.json()["idArchive"], "shelf_code": f"EST-X-{suffix}", "shelf_name": "Estanteria otro archivo", "capacity_boxes": 2},
            headers=headers,
        )
        assert foreign_shelf.status_code == 201, foreign_shelf.text
        blocked = client.post(f"/api/v1/archives/boxes/{box.json()['idBox']}/move", json={"shelf_id": foreign_shelf.json()["idShelf"]}, headers=headers)
        assert blocked.status_code == 422, blocked.text


def test_transfer_batch_uses_archives_and_moves_document_custody():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        origin_archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"BATCH-{suffix}")
        destination_archive = client.post(
            "/api/v1/archives",
            json={
                "archive_code": f"ARCH-QA-{suffix}",
                "archive_name": f"Archivo Destino QA {suffix}",
                "archive_type": "central",
                "location_id": 1,
                "physical_location": "Sede QA",
            },
            headers=headers,
        )
        assert destination_archive.status_code == 201, destination_archive.text
        destination_archive_id = destination_archive.json()["idArchive"]

        subseries = client.get("/api/v1/trd/subseries", headers=headers)
        assert subseries.status_code == 200, subseries.text
        document = client.post(
            "/api/v1/documents",
            json={
                "document_name": "Documento para lote archivistico",
                "document_type": "acta",
                "archive_id": origin_archive_id,
                "expedient_id": expedient_id,
                "folder_id": folder_id,
                "subseries_id": subseries.json()[0]["idSubseries"],
                "folio_start": 1,
                "folio_end": 1,
            },
            headers=headers,
        )
        assert document.status_code == 201, document.text
        document_id = document.json()["idDocument"]

        batch = client.post(
            "/api/v1/transfer-batches",
            json={
                "batch_code": f"LT-QA-{suffix}",
                "origin_archive_id": origin_archive_id,
                "destination_archive_id": destination_archive_id,
            },
            headers=headers,
        )
        assert batch.status_code == 201, batch.text
        assert batch.json()["origin_archive_id"] == origin_archive_id
        assert batch.json()["destination_archive_id"] == destination_archive_id

        box = client.post(
            "/api/v1/archives/boxes",
            json={"archive_id": origin_archive_id, "box_code": f"BX-QA-{suffix}", "box_name": "Caja QA mixta", "capacity_folders": 10},
            headers=headers,
        )
        assert box.status_code == 201, box.text

        added_folder = client.post(
            f"/api/v1/transfer-batches/{batch.json()['idBatch']}/items",
            json={"entity_type": "folder", "entity_id": folder_id},
            headers=headers,
        )
        assert added_folder.status_code == 201, added_folder.text
        added_box = client.post(
            f"/api/v1/transfer-batches/{batch.json()['idBatch']}/items",
            json={"entity_type": "box", "entity_id": box.json()["idBox"]},
            headers=headers,
        )
        assert added_box.status_code == 201, added_box.text
        items = client.get(f"/api/v1/transfer-batches/{batch.json()['idBatch']}/items", headers=headers)
        assert items.status_code == 200, items.text
        assert {item["entity_type"] for item in items.json()} == {"folder", "box"}

        status = "pending"
        for next_status in ["approved", "packed", "shipped", "received"]:
            advanced = client.patch(
                f"/api/v1/transfer-batches/{batch.json()['idBatch']}/status",
                json={"status": next_status, "notes": f"{status} -> {next_status}"},
                headers=headers,
            )
            assert advanced.status_code == 200, advanced.text
            if next_status == "approved":
                assert advanced.json()["fuid_code"]
            status = next_status

        moved = client.get(f"/api/v1/documents/{document_id}", headers=headers)
        assert moved.status_code == 200, moved.text
        assert moved.json()["archive_id"] == destination_archive_id
        exported = client.get("/api/v1/archives/fuid.csv", headers=headers)
        assert exported.status_code == 200, exported.text
        assert f"LT-QA-{suffix}" in exported.text


def test_advanced_reception_reviews_batch_items_individually():
    suffix = uuid4().hex[:8]
    with TestClient(app) as client:
        headers = _headers(client)
        origin_archive_id, expedient_id, folder_id = _create_expedient_and_folder(client, headers, f"REC-{suffix}")
        destination_archive = client.post(
            "/api/v1/archives",
            json={
                "archive_code": f"ARCH-REC-{suffix}",
                "archive_name": f"Archivo Recepcion QA {suffix}",
                "archive_type": "central",
                "location_id": 1,
                "physical_location": "Sede Recepcion QA",
            },
            headers=headers,
        )
        assert destination_archive.status_code == 201, destination_archive.text
        destination_archive_id = destination_archive.json()["idArchive"]

        subseries = client.get("/api/v1/trd/subseries", headers=headers)
        assert subseries.status_code == 200, subseries.text
        accepted_document = client.post(
            "/api/v1/documents",
            json={
                "document_name": "Documento aceptado por carpeta",
                "document_type": "acta",
                "archive_id": origin_archive_id,
                "expedient_id": expedient_id,
                "folder_id": folder_id,
                "subseries_id": subseries.json()[0]["idSubseries"],
                "folio_start": 1,
                "folio_end": 2,
            },
            headers=headers,
        )
        assert accepted_document.status_code == 201, accepted_document.text

        second_folder = client.post(
            "/api/v1/archives/folders",
            json={"expedient_id": expedient_id, "folder_code": f"CARP-PARC-{suffix}", "folder_name": "Carpeta parcial QA"},
            headers=headers,
        )
        assert second_folder.status_code == 201, second_folder.text
        partial_document = client.post(
            "/api/v1/documents",
            json={
                "document_name": "Documento parcial",
                "document_type": "acta",
                "archive_id": origin_archive_id,
                "expedient_id": expedient_id,
                "folder_id": second_folder.json()["idFolder"],
                "subseries_id": subseries.json()[0]["idSubseries"],
                "folio_start": 3,
                "folio_end": 5,
            },
            headers=headers,
        )
        assert partial_document.status_code == 201, partial_document.text

        box = client.post(
            "/api/v1/archives/boxes",
            json={"archive_id": origin_archive_id, "box_code": f"BX-REC-{suffix}", "box_name": "Caja rechazada QA", "capacity_folders": 5},
            headers=headers,
        )
        assert box.status_code == 201, box.text

        batch = client.post(
            "/api/v1/transfer-batches",
            json={
                "batch_code": f"REC-QA-{suffix}",
                "origin_archive_id": origin_archive_id,
                "destination_archive_id": destination_archive_id,
            },
            headers=headers,
        )
        assert batch.status_code == 201, batch.text
        batch_id = batch.json()["idBatch"]
        for payload in [
            {"entity_type": "folder", "entity_id": folder_id},
            {"entity_type": "document", "entity_id": partial_document.json()["idDocument"]},
            {"entity_type": "box", "entity_id": box.json()["idBox"]},
        ]:
            added = client.post(f"/api/v1/transfer-batches/{batch_id}/items", json=payload, headers=headers)
            assert added.status_code == 201, added.text

        listed = client.get(f"/api/v1/transfer-batches/{batch_id}/reception/items", headers=headers)
        assert listed.status_code == 200, listed.text
        by_type = {item["entity_type"]: item for item in listed.json()}

        close_pending = client.post(f"/api/v1/transfer-batches/{batch_id}/reception/close", json={}, headers=headers)
        assert close_pending.status_code == 409, close_pending.text

        accepted = client.post(
            f"/api/v1/transfer-batches/{batch_id}/reception/items/{by_type['folder']['idBatchItem']}/accept",
            json={"observation": "Carpeta completa"},
            headers=headers,
        )
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["status"] == "accepted"

        partial_without_observation = client.post(
            f"/api/v1/transfer-batches/{batch_id}/reception/items/{by_type['document']['idBatchItem']}/partial",
            json={"received_folios": 1},
            headers=headers,
        )
        assert partial_without_observation.status_code == 422, partial_without_observation.text
        partial = client.post(
            f"/api/v1/transfer-batches/{batch_id}/reception/items/{by_type['document']['idBatchItem']}/partial",
            json={"received_quantity": 1, "received_folios": 1, "observation": "Faltan folios 4-5", "rejection_reason": "missing_folios"},
            headers=headers,
        )
        assert partial.status_code == 200, partial.text
        assert partial.json()["status"] == "partially_received"

        reject_without_reason = client.post(
            f"/api/v1/transfer-batches/{batch_id}/reception/items/{by_type['box']['idBatchItem']}/reject",
            json={"observation": "Caja equivocada"},
            headers=headers,
        )
        assert reject_without_reason.status_code == 422, reject_without_reason.text
        rejected = client.post(
            f"/api/v1/transfer-batches/{batch_id}/reception/items/{by_type['box']['idBatchItem']}/reject",
            json={"rejection_reason": "wrong_box", "observation": "Caja no corresponde al FUID"},
            headers=headers,
        )
        assert rejected.status_code == 200, rejected.text
        assert rejected.json()["status"] == "rejected"

        comparison = client.get(f"/api/v1/transfer-batches/{batch_id}/reception/fuid-comparison", headers=headers)
        assert comparison.status_code == 200, comparison.text
        assert comparison.json()["expected_folios"] >= 5
        assert comparison.json()["inconsistencies"]

        moved = client.get(f"/api/v1/documents/{accepted_document.json()['idDocument']}", headers=headers)
        assert moved.status_code == 200, moved.text
        assert moved.json()["archive_id"] == destination_archive_id
        not_moved = client.get(f"/api/v1/documents/{partial_document.json()['idDocument']}", headers=headers)
        assert not_moved.status_code == 200, not_moved.text
        assert not_moved.json()["archive_id"] == origin_archive_id

        closed = client.post(f"/api/v1/transfer-batches/{batch_id}/reception/close", json={"observation": "Cierre QA"}, headers=headers)
        assert closed.status_code == 200, closed.text
        assert closed.json()["status"] == "closed"

        kardex = client.get("/api/v1/archives/kardex", headers=headers)
        assert kardex.status_code == 200, kardex.text
        movement_types = {item["movement_type"] for item in kardex.json()}
        assert "reception.item.accepted" in movement_types
        assert "reception.item.rejected" in movement_types
        assert "reception.item.partially_received" in movement_types

        summary = client.get("/api/v1/kardex/summary", headers=headers)
        assert summary.status_code == 200, summary.text
        assert summary.json()["documents"] >= 1

        timeline = client.get("/api/v1/kardex/timeline", params={"archive_id": destination_archive_id, "status": "accepted"}, headers=headers)
        assert timeline.status_code == 200, timeline.text
        assert any(item["event_type"] == "reception.item.accepted" for item in timeline.json())

        document_timeline = client.get(f"/api/v1/kardex/entities/document/{accepted_document.json()['idDocument']}/timeline", headers=headers)
        assert document_timeline.status_code == 200, document_timeline.text
        assert any(item["event_type"] == "custody.changed" for item in document_timeline.json())

        folder_trace = client.get(f"/api/v1/kardex/entities/folder/{folder_id}/trace", headers=headers)
        assert folder_trace.status_code == 200, folder_trace.text
        assert folder_trace.json()["current_archive_id"] == destination_archive_id

        balance = client.get(f"/api/v1/kardex/archive/{destination_archive_id}/balance", headers=headers)
        assert balance.status_code == 200, balance.text
        assert balance.json()["documents"] >= 1

        exported = client.get("/api/v1/kardex/export", params={"archive_id": destination_archive_id, "status": "accepted"}, headers=headers)
        assert exported.status_code == 200, exported.text
        assert "movement_code,event_type" in exported.text
