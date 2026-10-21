"""Portable bulk insert-or-ignore / insert-or-update for SQLite and PostgreSQL."""

from collections.abc import Sequence
from typing import Any

from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from src.database.models import Base

# Keep each statement well under SQLite's bound-parameter limit.
CHUNK_SIZE = 500


def _insert_for(session: Session, model: type[Base]):
    dialect = session.get_bind().dialect.name
    if dialect == "postgresql":
        return postgresql.insert(model)
    if dialect == "sqlite":
        return sqlite.insert(model)
    raise NotImplementedError(f"Upserts are not supported on {dialect}")


def insert_ignore(
    session: Session, model: type[Base], rows: Sequence[dict[str, Any]], keys: Sequence[str]
) -> int:
    """Insert rows, skipping any that collide on the unique `keys`. Returns rows inserted."""
    if not rows:
        return 0
    stmt = (
        _insert_for(session, model).values(list(rows)).on_conflict_do_nothing(index_elements=keys)
    )
    return session.execute(stmt).rowcount or 0


def upsert(
    session: Session, model: type[Base], rows: Sequence[dict[str, Any]], keys: Sequence[str]
) -> int:
    """Insert rows, overwriting non-key columns of rows that already exist."""
    total = 0
    for start in range(0, len(rows), CHUNK_SIZE):
        stmt = _insert_for(session, model).values(list(rows[start : start + CHUNK_SIZE]))
        update_columns = {col: stmt.excluded[col] for col in rows[0] if col not in keys}
        stmt = stmt.on_conflict_do_update(index_elements=keys, set_=update_columns)
        total += session.execute(stmt).rowcount or 0
    return total
