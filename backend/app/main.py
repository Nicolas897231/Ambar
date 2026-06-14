import hmac
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.middleware import DistributedRateLimitMiddleware, MetricsMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware
from app.db.bootstrap import seed_database
from app.db.session import Base, SessionLocal, engine, read_engine
from app.services.cache import get_json, set_json
from app.services.metrics import metrics_registry



def ensure_archival_document_columns() -> None:
    inspector = inspect(engine)
    if "ps520_documents" not in inspector.get_table_names():
        return
    existing = {item["name"] for item in inspector.get_columns("ps520_documents")}
    columns = {
        "ps930IdArchive": "INTEGER",
        "ps950IdExpedient": "INTEGER",
        "ps952IdFolder": "INTEGER",
        "folio_start": "INTEGER",
        "folio_end": "INTEGER",
        "folio_total": "INTEGER",
        "physical_location": "VARCHAR(255)",
    }
    with engine.begin() as connection:
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE ps520_documents ADD COLUMN {name} {definition}"))


def ensure_transfer_batch_archive_columns() -> None:
    inspector = inspect(engine)
    if "ps1070_transfer_batches" not in inspector.get_table_names():
        return
    existing = {item["name"] for item in inspector.get_columns("ps1070_transfer_batches")}
    columns = {
        "ps930OriginArchiveId": "INTEGER",
        "ps930DestinationArchiveId": "INTEGER",
    }
    with engine.begin() as connection:
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE ps1070_transfer_batches ADD COLUMN {name} {definition}"))


def ensure_transfer_batch_item_reception_columns() -> None:
    inspector = inspect(engine)
    if "ps1073_transfer_batch_items" not in inspector.get_table_names():
        return
    existing = {item["name"] for item in inspector.get_columns("ps1073_transfer_batch_items")}
    columns = {
        "expected_quantity": "INTEGER",
        "received_quantity": "INTEGER",
        "expected_folios": "INTEGER",
        "received_folios": "INTEGER",
        "rejection_reason": "VARCHAR(80)",
        "observation": "TEXT",
        "evidence_url": "VARCHAR(500)",
        "reviewed_by": "VARCHAR(40)",
        "reviewed_at": "DATETIME",
        "ps930OriginArchiveId": "INTEGER",
        "ps930DestinationArchiveId": "INTEGER",
    }
    with engine.begin() as connection:
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE ps1073_transfer_batch_items ADD COLUMN {name} {definition}"))


def ensure_deep_kardex_columns() -> None:
    inspector = inspect(engine)
    if "ps960_kardex_movements" not in inspector.get_table_names():
        return
    existing = {item["name"] for item in inspector.get_columns("ps960_kardex_movements")}
    columns = {
        "movement_code": "VARCHAR(80)",
        "related_document_id": "INTEGER",
        "related_folder_id": "INTEGER",
        "related_expedient_id": "INTEGER",
        "related_box_id": "INTEGER",
        "related_transfer_id": "INTEGER",
        "related_loan_id": "INTEGER",
        "origin_location_id": "INTEGER",
        "destination_location_id": "INTEGER",
        "previous_status": "VARCHAR(40)",
        "evidence_url": "VARCHAR(500)",
        "ip_address": "VARCHAR(80)",
        "user_agent": "VARCHAR(255)",
    }
    with engine.begin() as connection:
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE ps960_kardex_movements ADD COLUMN {name} {definition}"))


def ensure_audit_security_columns() -> None:
    inspector = inspect(engine)
    if "ps820_audit_log" not in inspector.get_table_names():
        return
    existing = {item["name"] for item in inspector.get_columns("ps820_audit_log")}
    columns = {
        "ps930IdArchive": "INTEGER",
        "entity_label": "VARCHAR(255)",
        "result": "VARCHAR(40)",
        "severity": "VARCHAR(40)",
        "user_agent": "VARCHAR(255)",
        "request_id": "VARCHAR(120)",
    }
    with engine.begin() as connection:
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE ps820_audit_log ADD COLUMN {name} {definition}"))


def ensure_operational_notification_columns() -> None:
    inspector = inspect(engine)
    with engine.begin() as connection:
        if "ps1040_notifications" in inspector.get_table_names():
            existing = {item["name"] for item in inspector.get_columns("ps1040_notifications")}
            columns = {
                "ps930IdArchive": "INTEGER",
                "title": "VARCHAR(160)",
                "priority": "VARCHAR(40)",
                "notification_type": "VARCHAR(80)",
                "related_entity_type": "VARCHAR(80)",
                "related_entity_id": "VARCHAR(80)",
                "action_label": "VARCHAR(80)",
                "read_at": "DATETIME",
                "resolved_at": "DATETIME",
                "dismissed_at": "DATETIME",
                "metadata_json": "JSON",
                "updated_at": "DATETIME",
            }
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE ps1040_notifications ADD COLUMN {name} {definition}"))
        if "ps916_workflow_tasks" in inspector.get_table_names():
            existing = {item["name"] for item in inspector.get_columns("ps916_workflow_tasks")}
            columns = {
                "ps930IdArchive": "INTEGER",
                "module": "VARCHAR(80)",
                "related_entity_type": "VARCHAR(80)",
                "related_entity_id": "VARCHAR(80)",
                "priority": "VARCHAR(40)",
                "completed_by": "VARCHAR(40)",
                "resolution_note": "TEXT",
                "action_url": "VARCHAR(255)",
                "metadata_json": "JSON",
            }
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE ps916_workflow_tasks ADD COLUMN {name} {definition}"))


def ensure_document_core_columns() -> None:
    inspector = inspect(engine)
    if "ps522_document_files" not in inspector.get_table_names():
        return
    existing = {item["name"] for item in inspector.get_columns("ps522_document_files")}
    columns = {
        "version": "INTEGER",
        "uploaded_by": "VARCHAR(40)",
        "trace_id": "VARCHAR(120)",
    }
    with engine.begin() as connection:
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE ps522_document_files ADD COLUMN {name} {definition}"))


def ensure_trd_lifecycle_columns() -> None:
    inspector = inspect(engine)
    with engine.begin() as connection:
        if "ps608_trd_dependencies" not in inspector.get_table_names():
            connection.execute(text("""
                CREATE TABLE ps608_trd_dependencies (
                    idDependency INTEGER PRIMARY KEY,
                    code VARCHAR(40) NOT NULL UNIQUE,
                    name VARCHAR(160) NOT NULL,
                    description TEXT,
                    status VARCHAR(40) NOT NULL DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
                    updated_at DATETIME
                )
            """))
        if "ps610_trd_series" in inspector.get_table_names():
            existing = {item["name"] for item in inspector.get_columns("ps610_trd_series")}
            columns = {
                "ps608IdDependency": "INTEGER",
                "status": "VARCHAR(40) DEFAULT 'active'",
            }
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE ps610_trd_series ADD COLUMN {name} {definition}"))
        if "ps612_trd_subseries" in inspector.get_table_names():
            existing = {item["name"] for item in inspector.get_columns("ps612_trd_subseries")}
            if "status" not in existing:
                connection.execute(text("ALTER TABLE ps612_trd_subseries ADD COLUMN status VARCHAR(40) DEFAULT 'active'"))
        if "ps614_trd_disposition" in inspector.get_table_names():
            existing = {item["name"] for item in inspector.get_columns("ps614_trd_disposition")}
            if "procedure" not in existing:
                connection.execute(text("ALTER TABLE ps614_trd_disposition ADD COLUMN procedure TEXT"))
        if "ps950_expedients" in inspector.get_table_names():
            existing = {item["name"] for item in inspector.get_columns("ps950_expedients")}
            if "ps608IdDependency" not in existing:
                connection.execute(text("ALTER TABLE ps950_expedients ADD COLUMN ps608IdDependency INTEGER"))
        if "ps526_document_types" in inspector.get_table_names():
            existing = {item["name"] for item in inspector.get_columns("ps526_document_types")}
            if "required_in_expedient" not in existing:
                connection.execute(text("ALTER TABLE ps526_document_types ADD COLUMN required_in_expedient BOOLEAN DEFAULT 1"))


def ensure_audit_enhanced_columns() -> None:
    """Agrega columnas Laravel-Auditing-style al log de auditoría si no existen."""
    inspector = inspect(engine)
    if "ps820_audit_log" not in inspector.get_table_names():
        return
    existing = {item["name"] for item in inspector.get_columns("ps820_audit_log")}
    columns = {
        "event": "VARCHAR(80)",
        "auditable_type": "VARCHAR(120)",
        "auditable_id": "VARCHAR(80)",
        "url": "VARCHAR(500)",
        "tags": "JSON",
    }
    with engine.begin() as connection:
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE ps820_audit_log ADD COLUMN {name} {definition}"))


def ensure_hr_company_isolation() -> None:
    inspector = inspect(engine)
    hr_tables = [
        "ps1008_hr_positions",
        "ps1006_hr_departments",
        "ps1004_hr_candidates",
        "ps1005_hr_vacancies",
    ]
    for table in hr_tables:
        if table not in inspector.get_table_names():
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        if "company_id" in existing:
            continue
        existing_idx = {idx["name"] for idx in inspector.get_indexes(table)}
        idx_name = f"ix_{table}_company_id"
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE `{table}` ADD COLUMN company_id VARCHAR(40) NOT NULL DEFAULT 'default'"))
            if idx_name not in existing_idx:
                conn.execute(text(f"ALTER TABLE `{table}` ADD INDEX `{idx_name}` (company_id)"))


def ensure_phase3_custody_columns() -> None:
    inspector = inspect(engine)
    with engine.begin() as connection:
        if "ps934_shelves" in inspector.get_table_names():
            existing = {item["name"] for item in inspector.get_columns("ps934_shelves")}
            columns = {
                "floor": "VARCHAR(80)",
                "module": "VARCHAR(80)",
                "bay": "VARCHAR(80)",
            }
            for name, definition in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE ps934_shelves ADD COLUMN {name} {definition}"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
        ensure_archival_document_columns()
        ensure_transfer_batch_archive_columns()
        ensure_transfer_batch_item_reception_columns()
        ensure_deep_kardex_columns()
        ensure_audit_security_columns()
        ensure_audit_enhanced_columns()
        ensure_operational_notification_columns()
        ensure_document_core_columns()
        ensure_trd_lifecycle_columns()
        ensure_phase3_custody_columns()
        ensure_hr_company_isolation()
    if settings.seed_default_data:
        db = SessionLocal()
        try:
            seed_database(db)
        finally:
            db.close()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=f"{settings.project_name} API",
        version="0.4.0",
        description="Core enterprise para gestion documental, operacion avanzada, escalabilidad y alta disponibilidad.",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(MetricsMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(DistributedRateLimitMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.frontend_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Internal-Signature", "X-Ambar-Timestamp", "X-Ambar-Signature"],
    )

    @app.get("/health", tags=["system"])
    def health() -> dict:
        return {"status": "ok", "service": "ambar-api", "node": settings.cluster_node_id}

    @app.get("/health/live", tags=["system"])
    def live() -> dict:
        return {"status": "alive", "node": settings.cluster_node_id}

    @app.get("/health/ready", tags=["system"])
    def ready() -> dict:
        checks: dict[str, str] = {}
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            checks["mysql_primary"] = "ok"
        except Exception:
            checks["mysql_primary"] = "error"
        try:
            with read_engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            checks["mysql_read"] = "ok"
        except Exception:
            checks["mysql_read"] = "error"
        try:
            set_json("health:ready", {"status": "ok"}, ttl=10)
            checks["redis"] = "ok" if get_json("health:ready") else "degraded"
        except Exception:
            checks["redis"] = "degraded"
        status = "ready" if checks["mysql_primary"] == "ok" else "not_ready"
        return {"status": status, "checks": checks, "node": settings.cluster_node_id}

    @app.get("/metrics", tags=["system"])
    def metrics(request: Request) -> Response:
        # Requires X-Internal-Signature header to prevent metrics disclosure to unauthenticated clients.
        # Prometheus scrapers must be configured with this header.
        expected = settings.internal_service_secret
        provided = request.headers.get("X-Internal-Signature", "")
        if not provided or not hmac.compare_digest(provided.encode(), expected.encode()):
            return Response(status_code=401, content="Unauthorized")
        return Response(metrics_registry.render_prometheus(), media_type="text/plain; version=0.0.4")

    app.include_router(api_router)
    return app


app = create_app()
