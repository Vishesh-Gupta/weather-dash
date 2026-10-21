from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from src.api.app import create_app
from src.api.history import location_today
from src.database.models import DailyHistory, Location
from src.database.session import session_scope
from tests.seed import seed


@pytest.fixture
def client(app_db):
    return TestClient(create_app())


def test_normals_default_to_today_at_the_location(client):
    location_id = seed(history_days=730)
    response = client.get(f"/api/locations/{location_id}/normals")
    assert response.status_code == 200
    [normal] = response.json()
    with session_scope() as session:
        today = location_today(session.get(Location, location_id))
    assert normal["date"] == today.isoformat()
    # Two years of seeded history before today; the current season is excluded.
    assert normal["years"] in (1, 2)
    assert normal["temp_mean"] is not None
    assert normal["record_high"]["value"] >= normal["temp_max"]
    assert 0 <= normal["wet_day_chance"] <= 1


def test_normals_for_a_forecast_range(client):
    location_id = seed()
    start = datetime.now(UTC).date()
    end = start + timedelta(days=4)
    normals = client.get(f"/api/locations/{location_id}/normals?start={start}&end={end}").json()
    assert [n["date"] for n in normals] == [
        (start + timedelta(days=i)).isoformat() for i in range(5)
    ]


def test_normals_validation(client):
    location_id = seed(history_days=30)
    base = f"/api/locations/{location_id}/normals"
    assert client.get(f"{base}?start=2026-01-10&end=2026-01-01").status_code == 422
    assert client.get(f"{base}?start=2026-01-01&end=2026-03-01").status_code == 422
    assert client.get(f"{base}?window=0").status_code == 422
    assert client.get("/api/locations/999/normals").status_code == 404


def test_normals_without_enough_history(client):
    location_id = seed(history_days=30)
    [normal] = client.get(f"/api/locations/{location_id}/normals").json()
    assert normal["years"] == 0
    assert normal["temp_mean"] is None


def same_date_years_ago(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year - years)
    except ValueError:  # Feb 29
        return date(day.year - years, 2, 28)


def test_normals_use_each_earlier_year(client):
    location_id = seed(history_days=1)
    today = datetime.now(UTC).date()
    with session_scope() as session:
        for years_back, temp in ((1, 10.0), (2, 20.0), (3, 30.0)):
            day = (
                today.replace(year=today.year - years_back)
                if not (today.month == 2 and today.day == 29)
                else date(today.year - years_back, 2, 28)
            )
            session.add(
                DailyHistory(
                    location_id=location_id,
                    date=day,
                    temp_max=temp,
                    temp_min=temp - 5,
                    temp_mean=temp - 2,
                    precipitation_sum=0.0,
                )
            )
    [normal] = client.get(f"/api/locations/{location_id}/normals?start={today}").json()
    assert normal["years"] == 3
    assert normal["temp_max"] == pytest.approx(20.0)
    assert normal["record_high"] == {"value": 30.0, "date": normal["record_high"]["date"]}


def test_overview_lists_every_location(client):
    seed()
    items = client.get("/api/overview").json()
    assert len(items) == 1
    item = items[0]
    assert item["location"]["display_name"] == "Toronto, Ontario, CA"
    assert item["current"]["weather_description"] == "scattered clouds"
    assert item["air_quality"]["aqi"] in range(1, 6)
    assert item["today"]["high"] >= item["today"]["low"]
    assert item["normal"]["years"] >= 1


def test_overview_with_a_new_location_without_data(client):
    from src.database import repository

    with session_scope() as session:
        repository.add_location(session, name="Lima", country="PE", lat=-12.05, lon=-77.04)
    [item] = client.get("/api/overview").json()
    assert item["current"] is None
    assert item["air_quality"] is None
    assert item["today"] is None
    assert item["normal"] is None


def test_runs_report_their_kinds(client):
    seed()
    assert "kinds" in client.get("/api/collection-runs/latest").json()
