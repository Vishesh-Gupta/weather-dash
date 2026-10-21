"""Create database tables. Run with `python -m src.database.setup`."""

import logging

from sqlalchemy import Engine, inspect, text
from sqlalchemy.schema import CreateColumn

from src.database.models import Base
from src.database.session import get_engine

logger = logging.getLogger(__name__)


def add_missing_columns(engine: Engine) -> list[str]:
    """Add nullable columns that exist on the models but not yet in the database.

    Keeps databases created by earlier versions working without a migration tool.
    Only additive, nullable changes are handled; anything else needs a manual migration.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    added = []
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                if not column.nullable:
                    raise RuntimeError(
                        f"Cannot add non-nullable column {table.name}.{column.name} automatically"
                    )
                ddl = CreateColumn(column).compile(dialect=engine.dialect)
                conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {ddl}"))
                added.append(f"{table.name}.{column.name}")
    return added


def init_db(engine: Engine | None = None) -> None:
    engine = engine or get_engine()
    Base.metadata.create_all(engine)
    for column in add_missing_columns(engine):
        logger.info("Added column %s", column)
    logger.info("Database schema is up to date (%s)", engine.url.render_as_string())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    init_db()
