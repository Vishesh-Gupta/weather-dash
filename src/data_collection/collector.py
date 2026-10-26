"""Collect weather data for every tracked location and store it."""

import logging
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from src.data_collection.open_meteo import OpenMeteoClient
from src.data_collection.openweather import OpenWeatherClient
from src.database import repository
from src.database.models import (
    AirQualityReading,
    CollectionRun,
    DailyHistory,
    ForecastEntry,
    HourlyForecast,
    Location,
    PrecipitationNowcast,
    WeatherAlert,
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


class Kind(StrEnum):
    """Kinds of data the scheduler collects, each on its own interval."""

    CURRENT = "current"
    FORECAST = "forecast"
    AIR_QUALITY = "air_quality"
    # Hourly forecast and rain nowcast, from Open-Meteo rather than OpenWeather.
    HOURLY = "hourly"
    # Weather alerts, from OpenWeather's One Call API 3.0 (only when enabled).
    ALERTS = "alerts"


ALL_KINDS = frozenset(Kind)
OPENWEATHER_KINDS = frozenset({Kind.CURRENT, Kind.FORECAST, Kind.AIR_QUALITY})


def collect_current(
    session: Session, client: OpenWeatherClient, location: Location, collected_at: datetime
) -> int:
    current = client.current(location.lat, location.lon)
    if (offset := current.pop("utc_offset_seconds", None)) is not None:
        location.utc_offset_seconds = offset
    return insert_ignore(
        session,
        WeatherObservation,
        [{**current, "location_id": location.id, "collected_at": collected_at}],
        keys=["location_id", "observed_at"],
    )


def collect_forecast(
    session: Session, client: OpenWeatherClient, location: Location, issued_at: datetime
) -> int:
    rows = [
        {**entry, "location_id": location.id, "issued_at": issued_at}
        for entry in client.forecast(location.lat, location.lon)
    ]
    return insert_ignore(
        session, ForecastEntry, rows, keys=["location_id", "issued_at", "forecast_for"]
    )


def collect_air_quality(
    session: Session, client: OpenWeatherClient, location: Location, collected_at: datetime
) -> int:
    reading = client.air_quality(location.lat, location.lon)
    if not reading:
        return 0
    return insert_ignore(
        session,
        AirQualityReading,
        [{**reading, "location_id": location.id, "collected_at": collected_at}],
        keys=["location_id", "observed_at"],
    )


def collect_hourly(
    session: Session, client: OpenMeteoClient, location: Location, issued_at: datetime
) -> int:
    """Replace the location's hourly forecast and nowcast with the latest issue."""
    hours, quarters = client.forecast(location.lat, location.lon)
    for model, rows in ((HourlyForecast, hours), (PrecipitationNowcast, quarters)):
        session.execute(delete(model).where(model.location_id == location.id))
        if rows:
            session.execute(
                model.__table__.insert(),
                [{**row, "location_id": location.id, "issued_at": issued_at} for row in rows],
            )
    return len(hours)


def collect_alerts(
    session: Session, client: OpenWeatherClient, location: Location, collected_at: datetime
) -> int:
    """Replace the location's alerts with those currently in force."""
    alerts = client.alerts(location.lat, location.lon)
    session.execute(delete(WeatherAlert).where(WeatherAlert.location_id == location.id))
    if alerts:
        session.execute(
            WeatherAlert.__table__.insert(),
            [{**a, "location_id": location.id, "collected_at": collected_at} for a in alerts],
        )
    return len(alerts)


COLLECTORS = {
    Kind.CURRENT: collect_current,
    Kind.FORECAST: collect_forecast,
    Kind.AIR_QUALITY: collect_air_quality,
}


def collect_current_data(
    session: Session,
    client: OpenWeatherClient,
    location: Location,
    issued_at: datetime,
    kinds: frozenset[Kind] = ALL_KINDS,
) -> dict[str, int]:
    """Fetch the requested kinds of data for one location. Returns rows stored per kind."""
    return {
        kind.value: COLLECTORS[kind](session, client, location, issued_at)
        for kind in Kind
        if kind in kinds and kind in OPENWEATHER_KINDS
    }


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
    open_meteo_client: OpenMeteoClient | None = None,
    now: datetime | None = None,
    location_ids: list[int] | None = None,
    kinds: frozenset[Kind] = ALL_KINDS,
) -> CollectionRun:
    """Collect data for active locations, recording the outcome as a CollectionRun.

    `location_ids` limits the run to specific locations (e.g. one just added) and
    `kinds` to specific data. History is synced whenever it is due, in any run.

    Each location is committed separately so one failure does not discard the others,
    and its Open-Meteo data (hourly forecast, history) separately again: an outage of
    one service must not throw away what the other returned.
    """
    settings = get_settings()
    now = now or datetime.now(UTC)
    if not settings.one_call_enabled:
        kinds = kinds - {Kind.ALERTS}
    # Open-Meteo needs no key, so runs for its data alone work without one.
    if weather_client is None and kinds & (OPENWEATHER_KINDS | {Kind.ALERTS}):
        weather_client = OpenWeatherClient(settings)
    open_meteo_client = open_meteo_client or OpenMeteoClient(settings)

    with session_scope() as session:
        run = CollectionRun(started_at=now, kinds=",".join(k.value for k in Kind if k in kinds))
        session.add(run)
        session.flush()
        run_id = run.id
        active_ids = [loc.id for loc in repository.list_locations(session)]
        if location_ids is not None:
            wanted = set(location_ids)
            active_ids = [i for i in active_ids if i in wanted]
        location_ids = active_ids

    if not location_ids:
        logger.info("No tracked locations yet; add some from the dashboard")

    errors: list[str] = []
    processed = 0
    for location_id in location_ids:
        # A location counts as processed when any of its data was stored.
        attempted = failed = 0
        if kinds & OPENWEATHER_KINDS:
            attempted += 1
            try:
                with session_scope() as session:
                    location = session.get(Location, location_id)
                    counts = collect_current_data(session, weather_client, location, now, kinds)
                    logger.info("Collected %s: %s", location.display_name, counts)
            except Exception as exc:
                failed += 1
                logger.exception("Collection failed for location %s", location_id)
                errors.append(f"location {location_id}: {exc}")
        if Kind.HOURLY in kinds:
            attempted += 1
            try:
                with session_scope() as session:
                    location = session.get(Location, location_id)
                    hours = collect_hourly(session, open_meteo_client, location, now)
                    logger.info("Hourly forecast for %s: %s hours", location.display_name, hours)
            except Exception as exc:
                failed += 1
                logger.exception("Hourly forecast failed for location %s", location_id)
                errors.append(f"location {location_id} hourly: {exc}")
        if Kind.ALERTS in kinds:
            # A separate subscription, so its failures (say, not yet enabled) stay its own.
            attempted += 1
            try:
                with session_scope() as session:
                    location = session.get(Location, location_id)
                    alerts = collect_alerts(session, weather_client, location, now)
                    logger.info("Alerts for %s: %s", location.display_name, alerts)
            except Exception as exc:
                failed += 1
                logger.exception("Alerts failed for location %s", location_id)
                errors.append(f"location {location_id} alerts: {exc}")
        processed += failed < attempted or attempted == 0
        try:
            with session_scope() as session:
                location = session.get(Location, location_id)
                if history_due(location, now):
                    days = sync_history(
                        session, open_meteo_client, location, now, settings.backfill_years
                    )
                    logger.info("History for %s: %s days", location.display_name, days)
        except Exception as exc:
            logger.exception("History sync failed for location %s", location_id)
            errors.append(f"location {location_id} history: {exc}")

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
