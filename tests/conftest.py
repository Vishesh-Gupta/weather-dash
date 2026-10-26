import json
import os
from pathlib import Path

import pytest
from sqlalchemy.orm import Session, sessionmaker

from src.database import session as db_session
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
        "CURRENT_INTERVAL_MINUTES",
        "AIR_QUALITY_INTERVAL_MINUTES",
        "FORECAST_INTERVAL_MINUTES",
        "HOURLY_INTERVAL_MINUTES",
        "ALERTS_INTERVAL_MINUTES",
        "ONE_CALL_ENABLED",
        "ONE_CALL_API_KEY",
        "EVENTS_POLL_SECONDS",
        "WEATHER_CONFIG_PATH",
        "ADMIN_PASSWORD",
        "SESSION_SECRET",
        "SESSION_COOKIE_SECURE",
        "CORS_ORIGINS",
        "FRONTEND_DIST",
    ):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv(
        "DATABASE_URL", os.getenv("TEST_DATABASE_URL") or f"sqlite:///{tmp_path / 'test.db'}"
    )
    _clear_caches()
    yield
    _clear_caches()


def _clear_caches():
    config.get_settings.cache_clear()
    if db_session.get_engine.cache_info().currsize:
        db_session.get_engine().dispose()
    db_session.get_engine.cache_clear()
    db_session.get_session_factory.cache_clear()


FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str):
    return json.loads((FIXTURES / name).read_text())


@pytest.fixture
def app_db():
    """The application's own engine (via settings), with tables created."""
    engine = db_session.get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


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
