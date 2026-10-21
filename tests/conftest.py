import os

import pytest
from sqlalchemy.orm import Session, sessionmaker

from src.database.models import Base
from src.database.session import create_db_engine
from src.utils import config


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch, tmp_path):
    """Keep tests independent of the developer's .env and environment."""
    for var in (
        "WEATHER_API_KEY",
        "DATABASE_URL",
        "POSTGRES_HOST",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "POSTGRES_PORT",
        "POSTGRES_DB",
        "SCHEDULER_INTERVAL_MINUTES",
        "WEATHER_CONFIG_PATH",
    ):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    config.get_settings.cache_clear()
    yield
    config.get_settings.cache_clear()


@pytest.fixture
def engine(tmp_path):
    """SQLite by default; set TEST_DATABASE_URL to run against Postgres."""
    url = os.getenv("TEST_DATABASE_URL") or f"sqlite:///{tmp_path / 'weather.db'}"
    engine = create_db_engine(url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def session(engine) -> Session:
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        yield session
