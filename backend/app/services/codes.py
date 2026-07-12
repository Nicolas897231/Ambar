from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session


CODE_PATTERN = re.compile(r"^(?P<prefix>[A-Z0-9]+)-(?P<year>\d{4})-(?P<number>\d+)$")


def clean_code(value: str | None) -> str | None:
    normalized = (value or "").strip()
    return normalized or None


def generate_code(
    db: Session,
    model: type[Any],
    field_name: str,
    prefix: str,
    *,
    year: int | None = None,
    width: int = 6,
    scope_filters: list[Any] | None = None,
) -> str:
    year = year or datetime.now(UTC).year
    normalized_prefix = (clean_code(prefix) or "AMB").upper()
    base = f"{normalized_prefix}-{year}"
    field = getattr(model, field_name)
    pending_codes = {
        getattr(obj, field_name, None)
        for obj in db.new
        if isinstance(obj, model) and getattr(obj, field_name, None)
    }
    query = select(field).where(field.like(f"{base}-%"))
    for condition in scope_filters or []:
        query = query.where(condition)
    with db.no_autoflush:
        existing_codes = db.scalars(query).all()
    max_sequence = 0
    for code in [*existing_codes, *pending_codes]:
        match = CODE_PATTERN.match(str(code or ""))
        if match and match.group("prefix") == normalized_prefix and int(match.group("year")) == year:
            max_sequence = max(max_sequence, int(match.group("number")))

    for sequence in range(max_sequence + 1, max_sequence + 1000):
        candidate = f"{base}-{sequence:0{width}d}"
        exists_query = select(field).where(field == candidate)
        for condition in scope_filters or []:
            exists_query = exists_query.where(condition)
        with db.no_autoflush:
            exists = db.scalar(exists_query.limit(1))
        if candidate not in pending_codes and exists is None:
            return candidate

    raise RuntimeError(f"No fue posible generar un codigo disponible para {normalized_prefix}.")


def supplied_or_generated(
    db: Session,
    value: str | None,
    model: type[Any],
    field_name: str,
    prefix: str,
    *,
    scope_filters: list[Any] | None = None,
) -> str:
    return clean_code(value) or generate_code(db, model, field_name, prefix, scope_filters=scope_filters)
