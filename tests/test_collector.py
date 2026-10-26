from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select

from src.data_collection import collector
from src.data_collection.open_meteo import parse_daily
from src.data_collection.open_meteo import parse_forecast as parse_hourly
from src.data_collection.openweather import (
    OpenWeatherError,
    parse_air_quality,
    parse_current,
    parse_forecast,
)
from src.database import repository
from src.database.models import (
    AirQualityReading,
    CollectionRun,
    DailyHistory,
    ForecastEntry,
    HourlyForecast,
    Location,
    PrecipitationNowcast,
    WeatherObservation,
)
from src.database.session import session_scope
from tests.conftest import load_fixture

NOW = datetime(2025, 10, 21, 14, 30, tzinfo=UTC)


class StubWeatherClient:
    def __init__(self, fail_for: set[float] = frozenset()):
        self.fail_for = fail_for
        self.calls = 0

    def _check(self, lat):
        self.calls += 1
        if lat in self.fail_for:
            raise OpenWeatherError("boom")

    def current(self, lat, lon):
        self._check(lat)
        return parse_current(load_fixture("current.json"))

    def forecast(self, lat, lon):
        self._check(lat)
        return parse_forecast(load_fixture("forecast.json"))

    def air_quality(self, lat, lon):
        self._check(lat)
        return parse_air_quality(load_fixture("air_pollution.json"))


class StubHistoryClient:
    """Stands in for OpenMeteoClient: history and the hourly forecast."""

    def __init__(self):
        self.requests: list[tuple[date, date]] = []

    def daily_history(self, lat, lon, start, end):
        self.requests.append((start, end))
        return parse_daily(load_fixture("open_meteo_daily.json"))

    def forecast(self, lat, lon):
        return parse_hourly(load_fixture("open_meteo_forecast.json"))


def add_locations(*coords):
    with session_scope() as session:
        for i, (lat, lon) in enumerate(coords):
            repository.add_location(session, name=f"Place {i}", country="CA", lat=lat, lon=lon)


def count(model):
    with session_scope() as session:
        return session.scalar(select(func.count()).select_from(model))


def test_run_collection_stores_everything(app_db):
    add_locations((43.65, -79.38))
    history = StubHistoryClient()

    run = collector.run_collection(StubWeatherClient(), history, now=NOW)

    assert run.status == "success"
    assert run.locations_processed == 1
    assert run.finished_at is not None
    assert count(WeatherObservation) == 1
    assert count(ForecastEntry) == 3
    assert count(AirQualityReading) == 1
    assert count(DailyHistory) == 3
    assert count(HourlyForecast) == 48
    assert count(PrecipitationNowcast) == 8
    # First sync backfills five years from the start of the month.
    assert history.requests == [(date(2020, 10, 1), date(2025, 10, 20))]


def test_history_outage_keeps_current_data(app_db):
    add_locations((43.65, -79.38))

    class Down(StubHistoryClient):
        def daily_history(self, lat, lon, start, end):
            raise RuntimeError("Open-Meteo returned 429")

    run = collector.run_collection(StubWeatherClient(), Down(), now=NOW)

    assert run.status == "partial"
    assert "history" in run.errors
    assert count(WeatherObservation) == 1
    assert count(ForecastEntry) == 3
    assert count(DailyHistory) == 0
    with session_scope() as session:
        # Still due, so the next run tries again.
        assert collector.history_due(session.scalars(select(Location)).one(), NOW)


def test_repeated_runs_are_idempotent(app_db):
    add_locations((43.65, -79.38))
    weather, history = StubWeatherClient(), StubHistoryClient()

    collector.run_collection(weather, history, now=NOW)
    collector.run_collection(weather, history, now=NOW + timedelta(hours=1))

    # Same observation timestamp is not duplicated; each run keeps its forecast issue.
    assert count(WeatherObservation) == 1
    assert count(AirQualityReading) == 1
    assert count(ForecastEntry) == 6
    # History is refreshed at most once a day.
    assert len(history.requests) == 1
    assert count(CollectionRun) == 2


def test_history_refreshes_trailing_week_after_a_day(app_db):
    add_locations((43.65, -79.38))
    history = StubHistoryClient()
    collector.run_collection(StubWeatherClient(), history, now=NOW)
    collector.run_collection(StubWeatherClient(), history, now=NOW + timedelta(days=1))

    assert history.requests[1] == (date(2025, 10, 15), date(2025, 10, 21))
    assert count(DailyHistory) == 3


def test_one_failing_location_does_not_block_others(app_db):
    add_locations((43.65, -79.38), (10.0, 10.0))
    run = collector.run_collection(
        StubWeatherClient(fail_for={10.0}),
        StubHistoryClient(),
        now=NOW,
        kinds=collector.OPENWEATHER_KINDS,
    )

    assert run.status == "partial"
    assert run.locations_processed == 1
    assert "boom" in run.errors
    assert count(WeatherObservation) == 1


def test_all_failing_marks_run_failed(app_db):
    add_locations((10.0, 10.0))
    run = collector.run_collection(
        StubWeatherClient(fail_for={10.0}),
        StubHistoryClient(),
        now=NOW,
        kinds=collector.OPENWEATHER_KINDS,
    )
    assert run.status == "failed"
    assert run.locations_processed == 0


def test_inactive_locations_are_skipped(app_db):
    add_locations((43.65, -79.38))
    with session_scope() as session:
        loc = session.scalar(select(Location))
        repository.set_location_active(session, loc.id, False)

    weather = StubWeatherClient()
    run = collector.run_collection(weather, StubHistoryClient(), now=NOW)
    assert run.status == "success"
    assert run.locations_processed == 0
    assert weather.calls == 0


def test_history_upsert_overwrites_revised_values(app_db):
    add_locations((43.65, -79.38))
    with session_scope() as session:
        loc = session.scalar(select(Location))
        collector.sync_history(session, StubHistoryClient(), loc, NOW, 5)

    class RevisedHistory(StubHistoryClient):
        def daily_history(self, lat, lon, start, end):
            rows = super().daily_history(lat, lon, start, end)
            rows[2]["temp_max"] = 99.0
            return rows

    with session_scope() as session:
        loc = session.scalar(select(Location))
        collector.sync_history(session, RevisedHistory(), loc, NOW + timedelta(days=1), 5)

    with session_scope() as session:
        assert (
            session.scalar(
                select(DailyHistory.temp_max).where(DailyHistory.date == date(2025, 10, 19))
            )
            == 99.0
        )
    assert count(DailyHistory) == 3


def test_large_backfill_is_chunked(app_db):
    add_locations((43.65, -79.38))

    class FiveYears(StubHistoryClient):
        def daily_history(self, lat, lon, start, end):
            days = (end - start).days + 1
            return [{"date": start + timedelta(days=i), "temp_max": 1.0} for i in range(days)]

    with session_scope() as session:
        loc = session.scalar(select(Location))
        stored = collector.sync_history(session, FiveYears(), loc, NOW, 5)
    assert stored == count(DailyHistory) > 1800


def test_collection_without_locations(app_db):
    run = collector.run_collection(StubWeatherClient(), StubHistoryClient(), now=NOW)
    assert run.status == "success"
    assert run.locations_processed == 0


@pytest.mark.parametrize(
    "synced,expected",
    [(None, True), (NOW - timedelta(hours=23), False), (NOW - timedelta(hours=24), True)],
)
def test_history_due(synced, expected):
    assert collector.history_due(Location(history_backfilled_at=synced), NOW) is expected


def test_collection_records_location_utc_offset(app_db):
    add_locations((43.65, -79.38))
    collector.run_collection(StubWeatherClient(), StubHistoryClient(), now=NOW)
    with session_scope() as session:
        assert session.scalar(select(Location)).utc_offset_seconds == -14400


def test_run_collection_can_target_locations(app_db):
    add_locations((43.65, -79.38), (48.85, 2.35))
    with session_scope() as session:
        paris = session.scalar(select(Location).where(Location.lat == 48.85))
    weather = StubWeatherClient()
    run = collector.run_collection(weather, StubHistoryClient(), now=NOW, location_ids=[paris.id])
    assert run.locations_processed == 1
    assert weather.calls == 3


def test_runs_collect_only_requested_kinds(app_db):
    add_locations((43.65, -79.38))
    weather = StubWeatherClient()
    run = collector.run_collection(
        weather, StubHistoryClient(), now=NOW, kinds=frozenset({collector.Kind.CURRENT})
    )
    assert run.kinds == "current"
    assert weather.calls == 1
    assert count(WeatherObservation) == 1
    assert count(ForecastEntry) == 0
    assert count(AirQualityReading) == 0
    # History still syncs when due, whatever the kinds.
    assert count(DailyHistory) == 3


def test_full_runs_record_every_kind(app_db):
    run = collector.run_collection(StubWeatherClient(), StubHistoryClient(), now=NOW)
    assert run.kinds == "current,forecast,air_quality,hourly"


def test_hourly_forecast_keeps_only_the_latest_issue(app_db):
    add_locations((43.65, -79.38))
    history = StubHistoryClient()
    collector.run_collection(StubWeatherClient(), history, now=NOW)
    later = NOW + timedelta(minutes=15)
    collector.run_collection(
        StubWeatherClient(), history, now=later, kinds=frozenset({collector.Kind.HOURLY})
    )
    assert count(HourlyForecast) == 48
    assert count(PrecipitationNowcast) == 8
    with session_scope() as session:
        assert set(session.scalars(select(HourlyForecast.issued_at))) == {later}


def test_hourly_only_run_skips_openweather(app_db):
    add_locations((43.65, -79.38))
    weather = StubWeatherClient()
    run = collector.run_collection(
        weather, StubHistoryClient(), now=NOW, kinds=frozenset({collector.Kind.HOURLY})
    )
    assert run.status == "success"
    assert run.kinds == "hourly"
    assert weather.calls == 0
    assert count(HourlyForecast) == 48


def test_open_meteo_forecast_outage_keeps_openweather_data(app_db):
    add_locations((43.65, -79.38))

    class Down(StubHistoryClient):
        def forecast(self, lat, lon):
            raise RuntimeError("Open-Meteo returned 503")

    run = collector.run_collection(StubWeatherClient(), Down(), now=NOW)
    assert run.status == "partial"
    assert run.locations_processed == 1
    assert "hourly" in run.errors
    assert count(WeatherObservation) == 1
    assert count(DailyHistory) == 3


def test_hourly_runs_need_no_openweather_key(app_db, monkeypatch):
    monkeypatch.delenv("WEATHER_API_KEY", raising=False)
    add_locations((43.65, -79.38))
    run = collector.run_collection(
        open_meteo_client=StubHistoryClient(), now=NOW, kinds=frozenset({collector.Kind.HOURLY})
    )
    assert run.status == "success"
    assert count(HourlyForecast) == 48
