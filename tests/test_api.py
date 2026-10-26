from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from src.api import collection
from src.api.app import create_app
from src.api.routes import geocode as geocode_routes
from src.api.routes import locations as location_routes
from src.api.routes import session as session_routes
from src.data_collection.openweather import OpenWeatherError
from src.utils.auth import LoginThrottle
from src.utils.config import get_settings
from tests.seed import seed

PASSWORD = "correct horse battery"


@pytest.fixture
def make_client(app_db, monkeypatch):
    monkeypatch.setattr(session_routes, "login_throttle", LoginThrottle())

    def factory(**env) -> TestClient:
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        get_settings.cache_clear()
        return TestClient(create_app())

    return factory


@pytest.fixture
def client(make_client):
    """Local mode: no admin password, API key configured."""
    return make_client(WEATHER_API_KEY="test")


@pytest.fixture
def public_client(make_client):
    return make_client(WEATHER_API_KEY="test", ADMIN_PASSWORD=PASSWORD)


@pytest.fixture
def started(monkeypatch):
    """Record collections the API starts instead of running them."""
    calls = []
    monkeypatch.setattr(
        location_routes, "start_collection", lambda bg, ids=None: calls.append(ids) or True
    )
    return calls


def sign_in(client: TestClient, password: str = PASSWORD):
    return client.post("/api/session", json={"password": password})


# --- Read endpoints -------------------------------------------------------------


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok", "database": "ok"}


def test_openapi_docs_served(client):
    assert client.get("/api/docs").status_code == 200
    assert (
        "/api/locations/{location_id}/forecast" in client.get("/api/openapi.json").json()["paths"]
    )


def test_list_and_get_locations(client):
    location_id = seed()
    locations = client.get("/api/locations").json()
    assert [loc["display_name"] for loc in locations] == ["Toronto, Ontario, CA"]
    assert locations[0]["utc_offset_seconds"] == -14400
    assert client.get(f"/api/locations/{location_id}").json()["name"] == "Toronto"


def test_unknown_location_is_404(client):
    for path in ("", "/current", "/forecast", "/observations", "/air-quality", "/history"):
        assert client.get(f"/api/locations/999{path}").status_code == 404


def test_current_conditions(client):
    location_id = seed()
    current = client.get(f"/api/locations/{location_id}/current").json()
    assert current["weather_description"] == "scattered clouds"
    assert datetime.fromisoformat(current["observed_at"]).tzinfo is not None


def test_location_without_data(client):
    from src.database import repository
    from src.database.session import session_scope

    with session_scope() as session:
        location_id = repository.add_location(session, name="Empty", country="XX", lat=1, lon=1).id
    assert client.get(f"/api/locations/{location_id}/current").json() is None
    assert client.get(f"/api/locations/{location_id}/forecast").json() == {
        "issued_at": None,
        "entries": [],
    }
    assert client.get(f"/api/locations/{location_id}/history").json() == []


def test_observations_window(client):
    location_id = seed()
    # Seed data is hourly up to the current hour; the oldest point sits on the window edge.
    assert len(client.get(f"/api/locations/{location_id}/observations?days=1").json()) in (24, 25)
    assert len(client.get(f"/api/locations/{location_id}/observations").json()) in (168, 169)
    assert client.get(f"/api/locations/{location_id}/observations?days=0").status_code == 422
    assert client.get(f"/api/locations/{location_id}/observations?days=91").status_code == 422


def test_forecast(client):
    location_id = seed()
    body = client.get(f"/api/locations/{location_id}/forecast").json()
    assert len(body["entries"]) == 40
    assert body["issued_at"] is not None
    times = [e["forecast_for"] for e in body["entries"]]
    assert times == sorted(times)


def test_hourly(client):
    location_id = seed()
    body = client.get(f"/api/locations/{location_id}/hourly").json()
    assert len(body["hours"]) == 48
    assert len(body["nowcast"]) == 8
    assert body["issued_at"] is not None
    first = body["hours"][0]
    assert {"uv_index", "pop", "weather_code", "is_day", "wind_gust"} <= first.keys()
    times = [h["forecast_for"] for h in body["hours"]]
    assert times == sorted(times)


def test_hourly_before_any_collection(client):
    from src.database import repository
    from src.database.session import session_scope

    with session_scope() as session:
        loc = repository.add_location(session, name="Lima", country="PE", lat=-12.05, lon=-77.04)
        location_id = loc.id
    body = client.get(f"/api/locations/{location_id}/hourly").json()
    assert body == {"issued_at": None, "hours": [], "nowcast": []}
    assert client.get("/api/locations/999/hourly").status_code == 404


def test_air_quality(client):
    location_id = seed()
    readings = client.get(f"/api/locations/{location_id}/air-quality?days=7").json()
    assert len(readings) in (56, 57)
    assert {"aqi", "pm2_5", "pm10"} <= set(readings[0])


def test_history_range(client):
    location_id = seed()
    assert len(client.get(f"/api/locations/{location_id}/history").json()) == 730

    end = datetime.now(UTC).date() - timedelta(days=1)
    start = end - timedelta(days=29)
    rows = client.get(f"/api/locations/{location_id}/history?start={start}&end={end}").json()
    assert len(rows) == 30
    assert rows[0]["date"] == start.isoformat()

    bad = client.get(f"/api/locations/{location_id}/history?start={end}&end={start}")
    assert bad.status_code == 422


def test_latest_collection_run(client):
    assert client.get("/api/collection-runs/latest").json() is None
    seed()
    assert client.get("/api/collection-runs/latest").json()["status"] == "success"


def test_responses_are_compressed(client):
    location_id = seed()
    response = client.get(
        f"/api/locations/{location_id}/history", headers={"Accept-Encoding": "gzip"}
    )
    assert response.headers["content-encoding"] == "gzip"


# --- Session and admin -------------------------------------------------------------


def test_local_mode_everyone_is_admin(client):
    assert client.get("/api/session").json() == {
        "is_admin": True,
        "auth_required": False,
        "can_collect": True,
    }


def test_public_mode_visitor_session(public_client):
    assert public_client.get("/api/session").json() == {
        "is_admin": False,
        "auth_required": True,
        "can_collect": True,
    }


def test_visitors_cannot_manage(public_client, started):
    location_id = seed()
    payload = {"name": "Paris", "country": "FR", "lat": 48.85, "lon": 2.35}
    assert public_client.post("/api/locations", json=payload).status_code == 401
    assert public_client.delete(f"/api/locations/{location_id}").status_code == 401
    assert public_client.post("/api/collection-runs").status_code == 401
    assert public_client.get("/api/geocode?q=Paris").status_code == 401
    assert started == []
    # Reads still work.
    assert public_client.get("/api/locations").status_code == 200


def test_sign_in_flow(public_client, started):
    assert sign_in(public_client, "wrong").status_code == 401

    response = sign_in(public_client)
    assert response.status_code == 200
    assert response.json()["is_admin"] is True
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "secure" not in cookie

    payload = {"name": "Paris", "country": "FR", "lat": 48.85, "lon": 2.35}
    assert public_client.post("/api/locations", json=payload).status_code == 201

    assert public_client.delete("/api/session").json()["is_admin"] is False
    assert public_client.post("/api/locations", json=payload).status_code == 401


def test_sign_in_is_throttled(public_client):
    for _ in range(10):
        assert sign_in(public_client, "wrong").status_code == 401
    locked = sign_in(public_client)
    assert locked.status_code == 429
    assert public_client.get("/api/session").json()["is_admin"] is False


def test_secure_cookie_when_configured(make_client):
    client = make_client(
        ADMIN_PASSWORD=PASSWORD, SESSION_COOKIE_SECURE="true", SESSION_SECRET="s" * 32
    )
    assert "secure" in sign_in(client).headers["set-cookie"].lower()


def test_session_survives_restart_with_fixed_secret(make_client):
    env = {"ADMIN_PASSWORD": PASSWORD, "SESSION_SECRET": "x" * 32}
    first = make_client(**env)
    sign_in(first)
    second = make_client(**env)
    second.cookies = first.cookies
    assert second.get("/api/session").json()["is_admin"] is True


def test_cors_only_when_configured(make_client):
    origin = {"Origin": "http://localhost:5173"}
    plain = make_client()
    assert "access-control-allow-origin" not in plain.get("/api/health", headers=origin).headers

    cors = make_client(CORS_ORIGINS="http://localhost:5173")
    headers = cors.get("/api/health", headers=origin).headers
    assert headers["access-control-allow-origin"] == "http://localhost:5173"
    assert headers["access-control-allow-credentials"] == "true"


# --- Management -------------------------------------------------------------------


def test_create_location_collects_it(client, started):
    payload = {
        "name": "Paris",
        "state": "Ile-de-France",
        "country": "FR",
        "lat": 48.85341,
        "lon": 2.3488,
    }
    response = client.post("/api/locations", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["display_name"] == "Paris, Ile-de-France, FR"
    assert body["lat"] == 48.8534
    assert started == [[body["id"]]]
    assert len(client.get("/api/locations").json()) == 1


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "", "country": "FR", "lat": 0, "lon": 0},
        {"name": "X", "country": "FRA", "lat": 0, "lon": 0},
        {"name": "X", "country": "FR", "lat": 91, "lon": 0},
        {"name": "X", "country": "FR", "lat": 0, "lon": -181},
    ],
)
def test_create_location_validates(client, started, payload):
    assert client.post("/api/locations", json=payload).status_code == 422


def test_management_requires_api_key(make_client, started):
    client = make_client()
    payload = {"name": "Paris", "country": "FR", "lat": 48.85, "lon": 2.35}
    assert client.post("/api/locations", json=payload).status_code == 503
    assert client.post("/api/collection-runs").status_code == 503
    assert client.get("/api/session").json()["can_collect"] is False


def test_delete_location(client):
    location_id = seed()
    assert client.delete(f"/api/locations/{location_id}").status_code == 204
    assert client.get(f"/api/locations/{location_id}").status_code == 404
    assert client.delete(f"/api/locations/{location_id}").status_code == 404


def test_geocode(client, monkeypatch):
    results = [
        {
            "name": "Paris",
            "state": None,
            "country": "FR",
            "lat": 48.85,
            "lon": 2.35,
            "display_name": "Paris, FR",
        }
    ]
    monkeypatch.setattr(geocode_routes, "search_location", lambda q: results)
    assert client.get("/api/geocode?q=Paris").json() == results
    assert client.get("/api/geocode?q=").status_code == 422


def test_geocode_upstream_error(client, monkeypatch):
    def fail(q):
        raise OpenWeatherError("OpenWeather rejected the API key (401)")

    monkeypatch.setattr(geocode_routes, "search_location", fail)
    response = client.get("/api/geocode?q=Paris")
    assert response.status_code == 502
    assert "rejected" in response.json()["detail"]


def test_collect_now_runs_in_background(client, monkeypatch):
    calls = []
    monkeypatch.setattr(
        collection, "run_collection", lambda location_ids=None: calls.append(location_ids) or _run()
    )
    assert client.post("/api/collection-runs", json={"location_ids": [3]}).status_code == 202
    # TestClient runs background tasks before returning; the lock is released afterwards.
    assert calls == [[3]]
    assert not collection.is_running()


def test_collect_now_rejects_concurrent_runs(client):
    assert collection._running.acquire(blocking=False)
    try:
        assert client.post("/api/collection-runs").status_code == 409
    finally:
        collection._running.release()


def test_failed_background_run_releases_lock(client, monkeypatch):
    def explode(location_ids=None):
        raise RuntimeError("database down")

    monkeypatch.setattr(collection, "run_collection", explode)
    assert client.post("/api/collection-runs").status_code == 202
    assert not collection.is_running()


def _run():
    from src.database.models import CollectionRun

    return CollectionRun(id=1, status="success")


def test_create_location_while_collection_running(client):
    assert collection._running.acquire(blocking=False)
    try:
        payload = {"name": "Paris", "country": "FR", "lat": 48.85, "lon": 2.35}
        assert client.post("/api/locations", json=payload).status_code == 201
    finally:
        collection._running.release()
    assert len(client.get("/api/locations").json()) == 1
