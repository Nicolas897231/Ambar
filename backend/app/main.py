from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.middleware import DistributedRateLimitMiddleware, MetricsMiddleware, RequestContextMiddleware, SecurityHeadersMiddleware
from app.db.bootstrap import seed_database
from app.db.session import Base, SessionLocal, engine, read_engine
from app.services.cache import get_json, set_json
from app.services.metrics import metrics_registry


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
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
    )
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
    def metrics() -> Response:
        return Response(metrics_registry.render_prometheus(), media_type="text/plain; version=0.0.4")

    app.include_router(api_router)
    return app


app = create_app()