"""Read-side queries for the dashboard, returned as pandas DataFrames in local time."""

from datetime import UTC, date, datetime, timedelta, timezone

import pandas as pd
from sqlalchemy import func, select

from src.database.models import (
    AirQualityReading,
    CollectionRun,
    DailyHistory,
    ForecastEntry,
    Location,
    WeatherObservation,
)
from src.database.session import session_scope

# OpenWeather AQI scale (1-5) -> (label, status role)
AQI_LEVELS = {
    1: ("Good", "good"),
    2: ("Fair", "good"),
    3: ("Moderate", "warning"),
    4: ("Poor", "serious"),
    5: ("Very poor", "critical"),
}


def local_tz(location: Location) -> timezone:
    return timezone(timedelta(seconds=location.utc_offset_seconds or 0))


def _frame(models, columns: list[str]) -> pd.DataFrame:
    return pd.DataFrame(
        [{col: getattr(m, col) for col in columns} for m in models], columns=columns
    )


def _localize(df: pd.DataFrame, columns: list[str], tz: timezone) -> pd.DataFrame:
    for col in columns:
        if col in df:
            df[col] = pd.to_datetime(df[col], utc=True).dt.tz_convert(tz)
    return df


def latest_observation(location_id: int) -> WeatherObservation | None:
    with session_scope() as session:
        return session.scalar(
            select(WeatherObservation)
            .where(WeatherObservation.location_id == location_id)
            .order_by(WeatherObservation.observed_at.desc())
            .limit(1)
        )


OBSERVATION_COLUMNS = [
    "observed_at", "temp", "feels_like", "humidity", "pressure",
    "wind_speed", "wind_gust", "clouds", "rain_1h", "snow_1h",
]  # fmt: skip


def observations(location: Location, since: datetime) -> pd.DataFrame:
    with session_scope() as session:
        rows = session.scalars(
            select(WeatherObservation)
            .where(
                WeatherObservation.location_id == location.id,
                WeatherObservation.observed_at >= since,
            )
            .order_by(WeatherObservation.observed_at)
        ).all()
    return _localize(_frame(rows, OBSERVATION_COLUMNS), ["observed_at"], local_tz(location))


FORECAST_COLUMNS = [
    "issued_at", "forecast_for", "temp", "feels_like", "humidity", "wind_speed",
    "pop", "rain_3h", "snow_3h", "weather_main", "weather_description",
]  # fmt: skip


def latest_forecast(location: Location) -> pd.DataFrame:
    """The most recently issued forecast, from now onwards."""
    with session_scope() as session:
        issued = session.scalar(
            select(func.max(ForecastEntry.issued_at)).where(
                ForecastEntry.location_id == location.id
            )
        )
        rows = []
        if issued is not None:
            rows = session.scalars(
                select(ForecastEntry)
                .where(ForecastEntry.location_id == location.id, ForecastEntry.issued_at == issued)
                .order_by(ForecastEntry.forecast_for)
            ).all()
    df = _frame(rows, FORECAST_COLUMNS)
    df[["rain_3h", "snow_3h"]] = df[["rain_3h", "snow_3h"]].fillna(0.0)
    return _localize(df, ["issued_at", "forecast_for"], local_tz(location))


AIR_COLUMNS = ["observed_at", "aqi", "co", "no", "no2", "o3", "so2", "pm2_5", "pm10", "nh3"]


def air_quality(location: Location, since: datetime) -> pd.DataFrame:
    with session_scope() as session:
        rows = session.scalars(
            select(AirQualityReading)
            .where(
                AirQualityReading.location_id == location.id, AirQualityReading.observed_at >= since
            )
            .order_by(AirQualityReading.observed_at)
        ).all()
    return _localize(_frame(rows, AIR_COLUMNS), ["observed_at"], local_tz(location))


HISTORY_COLUMNS = [
    "date", "temp_max", "temp_min", "temp_mean", "precipitation_sum",
    "rain_sum", "snowfall_sum", "wind_speed_max", "wind_gusts_max", "sunshine_duration",
]  # fmt: skip


def daily_history(
    location_id: int, start: date | None = None, end: date | None = None
) -> pd.DataFrame:
    query = select(DailyHistory).where(DailyHistory.location_id == location_id)
    if start:
        query = query.where(DailyHistory.date >= start)
    if end:
        query = query.where(DailyHistory.date <= end)
    with session_scope() as session:
        rows = session.scalars(query.order_by(DailyHistory.date)).all()
    df = _frame(rows, HISTORY_COLUMNS)
    df["date"] = pd.to_datetime(df["date"])
    return df


def history_range(location_id: int) -> tuple[date, date] | None:
    with session_scope() as session:
        first, last = session.execute(
            select(func.min(DailyHistory.date), func.max(DailyHistory.date)).where(
                DailyHistory.location_id == location_id
            )
        ).one()
    return (first, last) if first else None


def last_collection_run() -> CollectionRun | None:
    with session_scope() as session:
        return session.scalar(
            select(CollectionRun).order_by(CollectionRun.started_at.desc()).limit(1)
        )


def now_utc() -> datetime:
    return datetime.now(UTC)
