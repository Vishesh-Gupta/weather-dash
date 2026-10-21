"""Create database tables. Run with `python -m src.database.setup`."""

import logging

from sqlalchemy import Engine

from src.database.models import Base
from src.database.session import get_engine

logger = logging.getLogger(__name__)


def init_db(engine: Engine | None = None) -> None:
    engine = engine or get_engine()
    Base.metadata.create_all(engine)
    logger.info("Database schema is up to date (%s)", engine.url.render_as_string())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    init_db()
