from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_DEFAULT_JWT_SECRET = "local-dev-secret-change-before-production"
_DEFAULT_INTERNAL_SECRET = "local-internal-secret"
_DEFAULT_MINIO_SECRET = "change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["local", "development", "staging", "production"] = "local"
    project_name: str = "Ambar"
    api_base_url: str = "http://localhost:8000"
    frontend_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    database_url: str = "sqlite:///./ambar.db"
    read_database_url: str | None = None
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_recycle_seconds: int = 1800
    auto_create_schema: bool = True
    seed_default_data: bool = True

    jwt_secret_key: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    internal_service_secret: str = _DEFAULT_INTERNAL_SECRET
    webhook_secret_encryption_key: str | None = None
    webhook_signature_tolerance_seconds: int = 300

    redis_url: str = "redis://localhost:6379/0"
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "ambar"
    minio_secret_key: str = _DEFAULT_MINIO_SECRET
    minio_bucket: str = "ambar-documents"
    max_upload_mb: int = 25
    rate_limit_per_minute: int = 120
    cluster_node_id: str = "local-node"
    opensearch_url: str | None = None
    opensearch_index: str = "ambar-documents"
    cache_default_ttl_seconds: int = 300

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def validate_production_safety(self) -> "Settings":
        if self.environment != "production":
            return self
        unsafe: list[str] = []
        if self.jwt_secret_key == _DEFAULT_JWT_SECRET or len(self.jwt_secret_key) < 32:
            unsafe.append("JWT_SECRET_KEY")
        if self.internal_service_secret == _DEFAULT_INTERNAL_SECRET or len(self.internal_service_secret) < 32:
            unsafe.append("INTERNAL_SERVICE_SECRET")
        if self.minio_secret_key == _DEFAULT_MINIO_SECRET or len(self.minio_secret_key) < 16:
            unsafe.append("MINIO_SECRET_KEY")
        if not self.webhook_secret_encryption_key or len(self.webhook_secret_encryption_key) < 32:
            unsafe.append("WEBHOOK_SECRET_ENCRYPTION_KEY")
        if self.auto_create_schema:
            unsafe.append("AUTO_CREATE_SCHEMA=false")
        if self.seed_default_data:
            unsafe.append("SEED_DEFAULT_DATA=false")
        if "*" in self.frontend_origins:
            unsafe.append("FRONTEND_ORIGINS without wildcard")
        if unsafe:
            raise ValueError("Unsafe production configuration: " + ", ".join(unsafe))
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()