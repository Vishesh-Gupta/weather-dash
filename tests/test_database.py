from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy import inspect, select

from src.database import repository
from src.database.models import Location, WeatherObservation
from src.database.setup import init_db


def test_init_db_creates_all_tables(tmp_path):
    from src.database.session import create_db_engine

    engine = create_db_engine(f"sqlite:///{tmp_path / 'nested' / 'init.db'}")
    init_db(engine)
    assert set(inspect(engine).get_table_names()) == {
        "locations",
        "weather_observations",
        "forecast_entries",
        "air_quality_readings",
        "daily_history",
        "collection_runs",
    }


def test_add_location_deduplicates_and_reactivates(session):
    first = repository.add_location(
        session, name="Toronto", state="Ontario", country="CA", lat=43.65348, lon=-79.38393
    )
    repository.set_location_active(session, first.id, False)

    again = repository.add_location(
        session, name="Toronto", country="CA", lat=43.653481, lon=-79.383931
    )
    assert again.id == first.id
    assert again.is_active
    assert again.lat == 43.6535
    assert (
        session.scalar(select(Location).where(Location.id == first.id)).display_name
        == "Toronto, Ontario, CA"
    )


def test_list_locations_filters_inactive(session):
    a = repository.add_location(session, name="Paris", country="FR", lat=48.85, lon=2.35)
    repository.add_location(session, name="Berlin", country="DE", lat=52.52, lon=13.40)
    repository.set_location_active(session, a.id, False)

    assert [loc.name for loc in repository.list_locations(session)] == ["Berlin"]
    assert [loc.name for loc in repository.list_locations(session, active_only=False)] == [
        "Berlin",
        "Paris",
    ]


def test_delete_location_cascades(session):
    loc = repository.add_location(session, name="Oslo", country="NO", lat=59.91, lon=10.75)
    session.add(
        WeatherObservation(
            location_id=loc.id, observed_at=datetime.now(UTC), temp=1.0, feels_like=-2.0
        )
    )
    session.commit()

    assert repository.delete_location(session, loc.id)
    session.commit()
    assert session.scalars(select(WeatherObservation)).all() == []
    assert not repository.delete_location(session, loc.id)


def test_datetimes_round_trip_as_utc(session):
    loc = repository.add_location(session, name="Tokyo", country="JP", lat=35.68, lon=139.69)
    tokyo_time = datetime(2025, 1, 1, 9, 0, tzinfo=timezone(timedelta(hours=9)))
    session.add(
        WeatherObservation(location_id=loc.id, observed_at=tokyo_time, temp=5.0, feels_like=3.0)
    )
    session.commit()
    session.expire_all()

    stored = session.scalar(select(WeatherObservation))
    assert stored.observed_at == datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    assert stored.observed_at.tzinfo is UTC


def test_naive_datetimes_rejected(session):
    loc = repository.add_location(session, name="Lima", country="PE", lat=-12.05, lon=-77.04)
    session.add(
        WeatherObservation(
            location_id=loc.id, observed_at=datetime(2025, 1, 1), temp=20.0, feels_like=20.0
        )
    )
    with pytest.raises(Exception, match="Naive datetimes"):
        session.commit()


def test_init_db_adds_new_nullable_columns_to_existing_tables(engine):
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE locations DROP COLUMN utc_offset_seconds"))
    assert "utc_offset_seconds" not in {c["name"] for c in inspect(engine).get_columns("locations")}

    init_db(engine)
    assert "utc_offset_seconds" in {c["name"] for c in inspect(engine).get_columns("locations")}
    init_db(engine)  # idempotent
