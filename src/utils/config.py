"""Application settings loaded from environment variables and config.yaml.

Environment variables always take precedence over values in config.yaml.
"""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = PROJECT_ROOT / "config.yaml"

load_dotenv()


@dataclass(frozen=True)
class Settings:
    api_key: str | None
    openweather_url: str
    request_delay_seconds: float
    timeout_seconds: float
    open_meteo_archive_url: str
    backfill_years: int
    scheduler_interval_minutes: int
    database_url: str
    # When set, the dashboard is read-only until an admin signs in.
    admin_password: str | None = None
    # Signs session cookies. Random per process when unset (sessions end on restart).
    session_secret: str | None = None
    # Send session cookies only over HTTPS; enable behind TLS in production.
    session_cookie_secure: bool = False
    # Comma-separated origins allowed to call the API from a browser (local frontend dev).
    cors_origins: tuple[str, ...] = ()
    # Built React app served by the API; skipped when it hasn't been built.
    frontend_dist: Path = PROJECT_ROOT / "frontend" / "dist"


def load_yaml_config(path: Path | None = None) -> dict[str, Any]:
    """Read config.yaml, returning an empty dict if it is missing or empty."""
    path = Path(os.getenv("WEATHER_CONFIG_PATH", path or DEFAULT_CONFIG_PATH))
    if not path.exists():
        return {}
    with path.open() as f:
        return yaml.safe_load(f) or {}


def build_database_url(db_config: dict[str, Any]) -> str:
    """Resolve the database URL: DATABASE_URL, then POSTGRES_*, then local SQLite."""
    if url := os.getenv("DATABASE_URL"):
        return url

    if host := os.getenv("POSTGRES_HOST"):
        user = os.getenv("POSTGRES_USER", "weather_user")
        password = os.getenv("POSTGRES_PASSWORD", "weather_pass")
        port = os.getenv("POSTGRES_PORT", "5432")
        name = os.getenv("POSTGRES_DB", "weather_db")
        return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}"

    sqlite_path = Path(db_config.get("sqlite_path", "data/weather.db"))
    if not sqlite_path.is_absolute():
        sqlite_path = PROJECT_ROOT / sqlite_path
    return f"sqlite:///{sqlite_path}"


@lru_cache
def get_settings() -> Settings:
    config = load_yaml_config()
    openweather = config.get("openweather", {})
    open_meteo = config.get("open_meteo", {})
    scheduler = config.get("scheduler", {})

    return Settings(
        api_key=os.getenv("WEATHER_API_KEY") or openweather.get("api_key"),
        openweather_url=openweather.get("url", "https://api.openweathermap.org/").rstrip("/"),
        request_delay_seconds=float(openweather.get("request_delay_seconds", 1.1)),
        timeout_seconds=float(openweather.get("timeout_seconds", 10)),
        open_meteo_archive_url=open_meteo.get(
            "archive_url", "https://archive-api.open-meteo.com/v1/archive"
        ),
        backfill_years=int(open_meteo.get("backfill_years", 5)),
        scheduler_interval_minutes=int(
            os.getenv("SCHEDULER_INTERVAL_MINUTES", scheduler.get("interval_minutes", 60))
        ),
        database_url=build_database_url(config.get("database", {})),
        admin_password=os.getenv("ADMIN_PASSWORD") or None,
        session_secret=os.getenv("SESSION_SECRET") or None,
        session_cookie_secure=os.getenv("SESSION_COOKIE_SECURE", "").lower()
        in {"1", "true", "yes"},
        cors_origins=tuple(
            origin.strip() for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()
        ),
        frontend_dist=Path(os.getenv("FRONTEND_DIST") or PROJECT_ROOT / "frontend" / "dist"),
    )


def get_api_key() -> str | None:
    """Return the OpenWeatherMap API key, if configured."""
    return get_settings().api_key
