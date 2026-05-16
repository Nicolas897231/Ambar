from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _engine_kwargs(url: str) -> dict:
    settings = get_settings()
    if url.startswith("sqlite"):
        return {"pool_pre_ping": True, "future": True}
    return {
        "pool_pre_ping": True,
        "future": True,
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_recycle": settings.db_pool_recycle_seconds,
    }


settings = get_settings()
engine = create_engine(settings.database_url, **_engine_kwargs(settings.database_url))
read_engine = create_engine(settings.read_database_url or settings.database_url, **_engine_kwargs(settings.read_database_url or settings.database_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
ReadSessionLocal = sessionmaker(bind=read_engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_read_db() -> Generator[Session, None, None]:
    db = ReadSessionLocal()
    try:
        yield db
    finally:
        db.close()