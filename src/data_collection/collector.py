"""Collect weather data for every tracked location and store it."""

import logging
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from src.data_collection.open_meteo import OpenMeteoClient
from src.data_collection.openweather import OpenWeatherClient
from src.database import repository
from src.database.models import (
    AirQualityReading,
    CollectionRun,
    DailyHistory,
    ForecastEntry,
    Location,
    WeatherObservation,
)
from src.database.session import session_scope
from src.database.upsert import insert_ignore, upsert
from src.utils.config import get_settings

logger = logging.getLogger(__name__)

# The Open-Meteo archive lags by a few days and revises recent values, so each
# refresh re-fetches this many trailing days.
HISTORY_REFRESH_OVERLAP_DAYS = 7
HISTORY_REFRESH_INTERVAL = timedelta(hours=24)


def collect_current_data(
    session: Session, client: OpenWeatherClient, location: Location, issued_at: datetime
) -> dict[str, int]:
    """Fetch current conditions, the 5-day forecast and air quality for one location."""
    current = client.current(location.lat, location.lon)
    observations = insert_ignore(
        session,
        WeatherObservation,
        [{**current, "location_id": location.id, "collected_at": issued_at}],
        keys=["location_id", "observed_at"],
    )

    forecast_rows = [
        {**entry, "location_id": location.id, "issued_at": issued_at}
        for entry in client.forecast(location.lat, location.lon)
    ]
    forecasts = insert_ignore(
        session, ForecastEntry, forecast_rows, keys=["location_id", "issued_at", "forecast_for"]
    )

    air_quality = 0
    if reading := client.air_quality(location.lat, location.lon):
        air_quality = insert_ignore(
            session,
            AirQualityReading,
            [{**reading, "location_id": location.id, "collected_at": issued_at}],
            keys=["location_id", "observed_at"],
        )

    return {"observations": observations, "forecasts": forecasts, "air_quality": air_quality}


def history_window(
    session: Session, location: Location, today: date, backfill_years: int
) -> tuple[date, date]:
    """Dates to request: a full backfill the first time, then a short trailing refresh."""
    end = today - timedelta(days=1)
    last_stored = session.scalar(
        select(func.max(DailyHistory.date)).where(DailyHistory.location_id == location.id)
    )
    if location.history_backfilled_at is None or last_stored is None:
        start = date(today.year - backfill_years, today.month, 1)
    else:
        start = min(
            last_stored + timedelta(days=1), today - timedelta(days=HISTORY_REFRESH_OVERLAP_DAYS)
        )
    return start, end


def history_due(location: Location, now: datetime) -> bool:
    synced = location.history_backfilled_at
    return synced is None or now - synced >= HISTORY_REFRESH_INTERVAL


def sync_history(
    session: Session,
    client: OpenMeteoClient,
    location: Location,
    now: datetime,
    backfill_years: int,
) -> int:
    start, end = history_window(session, location, now.date(), backfill_years)
    rows = [
        {**row, "location_id": location.id}
        for row in client.daily_history(location.lat, location.lon, start, end)
    ]
    stored = upsert(session, DailyHistory, rows, keys=["location_id", "date"])
    location.history_backfilled_at = now
    return stored


def run_collection(
    weather_client: OpenWeatherClient | None = None,
    history_client: OpenMeteoClient | None = None,
    now: datetime | None = None,
) -> CollectionRun:
    """Collect data for all active locations, recording the outcome as a CollectionRun.

    Each location is committed separately so one failure does not discard the others.
    """
    settings = get_settings()
    now = now or datetime.now(UTC)
    weather_client = weather_client or OpenWeatherClient(settings)
    history_client = history_client or OpenMeteoClient(settings)

    with session_scope() as session:
        run = CollectionRun(started_at=now)
        session.add(run)
        session.flush()
        run_id = run.id
        location_ids = [loc.id for loc in repository.list_locations(session)]

    if not location_ids:
        logger.info("No tracked locations yet; add some from the dashboard")

    errors: list[str] = []
    processed = 0
    for location_id in location_ids:
        try:
            with session_scope() as session:
                location = session.get(Location, location_id)
                counts = collect_current_data(session, weather_client, location, now)
                if history_due(location, now):
                    counts["history_days"] = sync_history(
                        session, history_client, location, now, settings.backfill_years
                    )
                logger.info("Collected %s: %s", location.display_name, counts)
            processed += 1
        except Exception as exc:
            logger.exception("Collection failed for location %s", location_id)
            errors.append(f"location {location_id}: {exc}")

    with session_scope() as session:
        run = session.get(CollectionRun, run_id)
        run.finished_at = datetime.now(UTC)
        run.locations_processed = processed
        run.errors = "\n".join(errors) or None
        if not errors:
            run.status = "success"
        elif processed:
            run.status = "partial"
        else:
            run.status = "failed"
        return run
