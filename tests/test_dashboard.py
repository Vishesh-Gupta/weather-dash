from datetime import UTC, datetime

import pandas as pd
import pytest
from streamlit.testing.v1 import AppTest

from src.dashboard import charts, data
from src.dashboard.app import forecast_summary, history_stats
from src.dashboard.units import Units, UnitSystem, compass
from src.database.models import Location
from src.database.session import session_scope
from src.utils.config import get_settings
from tests.seed import seed

APP = "src/dashboard/app.py"
METRIC = Units(UnitSystem.METRIC)
IMPERIAL = Units(UnitSystem.IMPERIAL)
NOW = datetime(2026, 10, 21, 14, tzinfo=UTC)


def location(location_id: int) -> Location:
    with session_scope() as session:
        return session.get(Location, location_id)


def test_unit_conversions():
    assert IMPERIAL.temp(100) == 212
    assert IMPERIAL.temp_delta(10) == 18
    assert METRIC.wind(10) == 36
    assert IMPERIAL.wind(10) == pytest.approx(22.37, abs=0.01)
    assert IMPERIAL.precip(25.4) == 1
    assert METRIC.distance(10000) == 10
    assert IMPERIAL.temp(pd.Series([0.0, 10.0])).tolist() == [32, 50]


@pytest.mark.parametrize(
    "deg,expected", [(0, "N"), (359, "N"), (45, "NE"), (250, "WSW"), (None, "")]
)
def test_compass(deg, expected):
    assert compass(deg) == expected


def test_queries_return_local_time(app_db):
    loc = location(seed(NOW))
    forecast = data.latest_forecast(loc)
    assert len(forecast) == 40
    assert str(forecast["forecast_for"].dt.tz) == "UTC-04:00"
    assert forecast["rain_3h"].notna().all()

    obs = data.observations(loc, NOW - pd.Timedelta(days=1))
    assert len(obs) == 25
    assert data.latest_observation(loc.id).observed_at == NOW
    assert len(data.air_quality(loc, NOW - pd.Timedelta(days=7))) == 57
    assert len(data.daily_history(loc.id)) == 730
    assert data.history_range(loc.id)[1] == NOW.date() - pd.Timedelta(days=1)
    assert data.last_collection_run().status == "success"


def test_empty_queries(app_db):
    loc = Location(id=999, name="Nowhere", country="XX", lat=0, lon=0)
    assert data.latest_forecast(loc).empty
    assert data.daily_history(999).empty
    assert data.history_range(999) is None
    assert data.last_collection_run() is None


def test_forecast_summary_groups_by_local_day(app_db):
    loc = location(seed(NOW))
    summary = forecast_summary(data.latest_forecast(loc), IMPERIAL)
    assert 5 <= len(summary) <= 6
    assert "High (°F)" in summary.columns
    assert summary["Max chance of precipitation"].str.endswith("%").all()


def test_history_stats(app_db):
    loc = location(seed(NOW))
    stats = {
        label: (value, detail)
        for label, value, detail in history_stats(data.daily_history(loc.id), METRIC)
    }
    assert set(stats) == {"Warmest day", "Coldest day", "Wettest day", "Total precipitation"}
    assert stats["Warmest day"][0].endswith("°C")
    assert stats["Total precipitation"][1] is None


def test_charts_build(app_db):
    loc = location(seed(NOW))
    forecast = data.latest_forecast(loc)
    history = data.daily_history(loc.id)
    air = data.air_quality(loc, NOW - pd.Timedelta(days=7))
    figures = [
        charts.forecast_temperature(forecast, METRIC),
        charts.forecast_precipitation_chance(forecast),
        charts.forecast_precipitation_amount(forecast, IMPERIAL),
        charts.observed_temperature(data.observations(loc, NOW - pd.Timedelta(days=7)), METRIC),
        charts.particulate_trend(air),
        charts.pollutant_breakdown(air.iloc[-1]),
        charts.history_temperature(history, IMPERIAL),
        charts.monthly_precipitation(history, METRIC),
    ]
    for fig in figures:
        assert fig.data, fig.layout.title
    assert len(charts.monthly_precipitation(history, METRIC).data[0].x) in (22, 23)


def test_complete_monthly_totals_drops_partial_months():
    days = pd.date_range("2025-01-15", "2025-03-31", freq="D")
    df = pd.DataFrame({"date": days, "precipitation_sum": 1.0})
    totals = charts.complete_monthly_totals(df, "precipitation_sum")
    assert totals.to_dict() == {pd.Timestamp("2025-02-01"): 28.0, pd.Timestamp("2025-03-01"): 31.0}


def run_app() -> AppTest:
    at = AppTest.from_file(APP, default_timeout=30)
    at.run()
    assert not at.exception, at.exception
    return at


def test_app_empty_state_without_api_key(app_db):
    at = run_app()
    assert at.title[0].value == "🌤️ Weather Analytics Dashboard"
    assert any("WEATHER_API_KEY" in w.value for w in at.warning)


def test_app_empty_state_with_api_key(app_db, monkeypatch):
    monkeypatch.setenv("WEATHER_API_KEY", "test")
    get_settings.cache_clear()
    at = run_app()
    assert any("Add your first location" in i.value for i in at.info)
    assert any(b.label == "Collect now" for b in at.sidebar.button)


def test_app_renders_seeded_location(app_db):
    seed()
    at = run_app()
    assert at.title[0].value == "Toronto, Ontario, CA"
    assert [t.label for t in at.tabs] == ["Now", "Forecast", "Air quality", "History"]
    assert any(m.label == "Feels like" for m in at.metric)
    assert any(m.label == "Warmest day" for m in at.metric)
    assert "°C" in at.subheader[0].value


def test_app_switches_to_imperial(app_db):
    seed()
    at = run_app()
    at.sidebar.radio(key="units").set_value(UnitSystem.IMPERIAL).run()
    assert not at.exception
    assert "°F" in at.subheader[0].value

    at.radio(key="history-period").set_value("All").run()
    assert not at.exception
    at.radio(key="obs-window").set_value("Last 24 hours").run()
    assert not at.exception


def test_app_search_and_track_location(app_db, monkeypatch):
    import src.data_collection.collector as collector_module
    import src.utils.locations as locations_module

    monkeypatch.setenv("WEATHER_API_KEY", "test")
    get_settings.cache_clear()
    monkeypatch.setattr(
        locations_module,
        "search_location",
        lambda query: [
            {"name": "Paris", "state": "Ile-de-France", "country": "FR", "lat": 48.8589, "lon": 2.32,
             "display_name": "Paris, Ile-de-France, FR"},
        ],
    )  # fmt: skip
    collected = []
    monkeypatch.setattr(
        collector_module,
        "run_collection",
        lambda location_ids=None: collected.append(location_ids)
        or collector_module.CollectionRun(status="success"),
    )

    at = run_app()
    at.sidebar.text_input[0].input("Paris")
    at.sidebar.button[0].click().run()
    assert not at.exception
    track = next(b for b in at.sidebar.button if b.label == "Track location")
    track.click().run()
    assert not at.exception

    assert at.title[0].value == "Paris, Ile-de-France, FR"
    assert len(collected) == 1 and len(collected[0]) == 1
