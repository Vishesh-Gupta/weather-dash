from datetime import UTC, datetime

import pytest
import requests
import responses
from responses import matchers

from src.data_collection.http import RateLimiter, build_session
from src.data_collection.openweather import (
    OpenWeatherClient,
    OpenWeatherError,
    parse_air_quality,
    parse_alerts,
    parse_current,
    parse_forecast,
)
from src.utils.config import get_settings
from src.utils.locations import search_location
from tests.conftest import load_fixture

BASE = "https://api.openweathermap.org"


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("WEATHER_API_KEY", "test-key")
    get_settings.cache_clear()
    return OpenWeatherClient(session=build_session(backoff_factor=0), rate_limiter=RateLimiter(0))


def test_parse_current():
    parsed = parse_current(load_fixture("current.json"))
    assert parsed["observed_at"] == datetime(2025, 10, 21, 14, 0, tzinfo=UTC)
    assert parsed["temp"] == 12.4
    assert parsed["wind_gust"] == 8.23
    assert parsed["rain_1h"] == 0.21
    assert parsed["snow_1h"] is None
    assert parsed["weather_description"] == "broken clouds"
    assert parsed["sunrise"].tzinfo is UTC


def test_parse_forecast():
    entries = parse_forecast(load_fixture("forecast.json"))
    assert len(entries) == 3
    assert entries[1]["rain_3h"] == 0.84
    assert entries[1]["pop"] == 0.62
    assert entries[0]["rain_3h"] is None
    assert entries[2]["forecast_for"] == datetime(2025, 10, 21, 21, 0, tzinfo=UTC)


def test_parse_air_quality():
    reading = parse_air_quality(load_fixture("air_pollution.json"))
    assert reading["aqi"] == 2
    assert reading["pm2_5"] == 6.21
    assert parse_air_quality({"list": []}) is None


def test_client_requires_api_key():
    with pytest.raises(OpenWeatherError, match="WEATHER_API_KEY"):
        OpenWeatherClient()


@responses.activate
def test_current_requests_metric_units(client):
    responses.get(
        f"{BASE}/data/2.5/weather",
        json=load_fixture("current.json"),
        match=[
            matchers.query_param_matcher(
                {"lat": "43.65", "lon": "-79.38", "units": "metric", "appid": "test-key"}
            )
        ],
    )
    assert client.current(43.65, -79.38)["temp"] == 12.4


@responses.activate
def test_geocode_and_search_location(client):
    responses.get(f"{BASE}/geo/1.0/direct", json=load_fixture("geocoding.json"))
    results = search_location("  Toronto ", client=client)
    assert [r["display_name"] for r in results] == ["Toronto, Ontario, CA", "Toronto, Ohio, US"]
    assert search_location("   ", client=client) == []
    assert len(responses.calls) == 1


@responses.activate
def test_invalid_key_raises_clear_error(client):
    responses.get(
        f"{BASE}/data/2.5/weather", status=401, json={"cod": 401, "message": "Invalid API key"}
    )
    with pytest.raises(OpenWeatherError, match="401"):
        client.current(0, 0)


@responses.activate
def test_retries_transient_errors(client):
    url = f"{BASE}/data/2.5/air_pollution"
    responses.get(url, status=503)
    responses.get(url, json=load_fixture("air_pollution.json"))
    assert client.air_quality(1, 2)["aqi"] == 2
    assert len(responses.calls) == 2


@responses.activate
def test_error_message_from_api(client):
    responses.get(
        f"{BASE}/data/2.5/forecast", status=400, json={"cod": "400", "message": "wrong latitude"}
    )
    with pytest.raises(OpenWeatherError, match="wrong latitude"):
        client.forecast(999, 0)


def test_rate_limiter_waits_between_calls():
    now = [100.0]
    slept = []

    def sleep(seconds):
        slept.append(seconds)
        now[0] += seconds

    limiter = RateLimiter(1.0, clock=lambda: now[0], sleep=sleep)
    limiter.wait()
    now[0] += 0.25
    limiter.wait()
    now[0] += 5
    limiter.wait()
    assert slept == [pytest.approx(0.75)]


@responses.activate
def test_connection_errors_never_reveal_the_key(client):
    # requests puts the full URL, query string and all, in connection errors.
    url = f"{BASE}/data/2.5/weather?lat=1&lon=2&appid=test-key"
    responses.get(
        f"{BASE}/data/2.5/weather",
        body=requests.ConnectionError(f"Max retries exceeded with url: {url}"),
    )
    with pytest.raises(OpenWeatherError) as caught:
        client.current(1, 2)
    assert "test-key" not in str(caught.value)
    assert "ConnectionError" in str(caught.value)


def test_parse_alerts():
    alerts = parse_alerts(load_fixture("one_call_alerts.json"))
    assert [a["event"] for a in alerts] == ["Wind Warning", "Special Weather Statement"]
    wind = alerts[0]
    assert wind["sender"] == "Environment and Climate Change Canada"
    assert wind["starts_at"] == datetime(2025, 10, 21, 14, tzinfo=UTC)
    assert wind["ends_at"] == datetime(2025, 10, 22, 3, tzinfo=UTC)
    assert wind["tags"] == "Wind"
    assert alerts[1]["tags"] is None
    # No "alerts" key means none are in force.
    assert parse_alerts({"lat": 1, "lon": 2}) == []


@responses.activate
def test_alerts_request_uses_one_call(client):
    responses.get(f"{BASE}/data/3.0/onecall", json=load_fixture("one_call_alerts.json"))
    assert len(client.alerts(43.65, -79.38)) == 2
    params = responses.calls[0].request.params
    assert params["exclude"] == "current,minutely,hourly,daily"
    assert params["appid"] == "test-key"


@responses.activate
def test_alerts_without_subscription_say_so(client):
    responses.get(f"{BASE}/data/3.0/onecall", status=401, json={"cod": 401})
    with pytest.raises(OpenWeatherError, match="One Call API 3.0 isn't enabled"):
        client.alerts(0, 0)


@responses.activate
def test_alerts_can_use_their_own_key(monkeypatch):
    monkeypatch.setenv("WEATHER_API_KEY", "main-key")
    monkeypatch.setenv("ONE_CALL_API_KEY", "one-call-key")
    get_settings.cache_clear()
    responses.get(f"{BASE}/data/3.0/onecall", json={})
    client = OpenWeatherClient(session=build_session(backoff_factor=0), rate_limiter=RateLimiter(0))
    assert client.alerts(1, 2) == []
    assert responses.calls[0].request.params["appid"] == "one-call-key"
