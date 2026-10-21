from src.utils import config


def test_env_overrides_yaml(monkeypatch, tmp_path):
    cfg = tmp_path / "config.yaml"
    cfg.write_text("scheduler:\n  current_minutes: 15\nopenweather:\n  api_key: from-yaml\n")
    monkeypatch.setenv("WEATHER_CONFIG_PATH", str(cfg))

    settings = config.get_settings()
    assert settings.current_interval_minutes == 15
    assert settings.api_key == "from-yaml"

    config.get_settings.cache_clear()
    monkeypatch.setenv("CURRENT_INTERVAL_MINUTES", "5")
    monkeypatch.setenv("WEATHER_API_KEY", "from-env")
    settings = config.get_settings()
    assert settings.current_interval_minutes == 5
    assert settings.api_key == "from-env"


def test_missing_config_file_uses_defaults(monkeypatch, tmp_path):
    monkeypatch.setenv("WEATHER_CONFIG_PATH", str(tmp_path / "missing.yaml"))
    settings = config.get_settings()
    assert settings.openweather_url == "https://api.openweathermap.org"
    assert settings.current_interval_minutes == 5
    assert settings.air_quality_interval_minutes == 30
    assert settings.forecast_interval_minutes == 60
    assert settings.events_poll_seconds == 3
    assert settings.backfill_years == 5
    assert settings.api_key is None


def test_database_url_prefers_explicit_url(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@db/x")
    monkeypatch.setenv("POSTGRES_HOST", "ignored")
    assert config.build_database_url({}) == "postgresql://u:p@db/x"


def test_database_url_from_postgres_vars(monkeypatch):
    monkeypatch.delenv("DATABASE_URL")
    monkeypatch.setenv("POSTGRES_HOST", "postgres")
    monkeypatch.setenv("POSTGRES_USER", "alice")
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.setenv("POSTGRES_DB", "wx")
    assert config.build_database_url({}) == "postgresql+psycopg2://alice:secret@postgres:5432/wx"


def test_database_url_falls_back_to_sqlite(monkeypatch):
    monkeypatch.delenv("DATABASE_URL")
    url = config.build_database_url({"sqlite_path": "data/local.db"})
    assert url == f"sqlite:///{config.PROJECT_ROOT / 'data/local.db'}"


def test_intervals_must_be_positive(monkeypatch):
    import pytest

    monkeypatch.setenv("FORECAST_INTERVAL_MINUTES", "0")
    with pytest.raises(ValueError, match="FORECAST_INTERVAL_MINUTES"):
        config.get_settings()
