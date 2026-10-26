"""Open-Meteo clients (free, no API key): the historical archive and the forecast.

https://open-meteo.com/en/docs/historical-weather-api
https://open-meteo.com/en/docs
"""

from datetime import UTC, date, datetime
from typing import Any

import requests

from src.data_collection.http import build_session
from src.utils.config import Settings, get_settings

# Open-Meteo variable name -> DailyHistory column
DAILY_VARIABLES = {
    "temperature_2m_max": "temp_max",
    "temperature_2m_min": "temp_min",
    "temperature_2m_mean": "temp_mean",
    "precipitation_sum": "precipitation_sum",
    "rain_sum": "rain_sum",
    "snowfall_sum": "snowfall_sum",
    "wind_speed_10m_max": "wind_speed_max",
    "wind_gusts_10m_max": "wind_gusts_max",
    "sunshine_duration": "sunshine_duration",
}


# Open-Meteo hourly variable -> HourlyForecast column
HOURLY_VARIABLES = {
    "temperature_2m": "temp",
    "apparent_temperature": "feels_like",
    "relative_humidity_2m": "humidity",
    "precipitation_probability": "pop",
    "precipitation": "precipitation",
    "rain": "rain",
    "showers": "showers",
    "snowfall": "snowfall",
    "weather_code": "weather_code",
    "cloud_cover": "clouds",
    "wind_speed_10m": "wind_speed",
    "wind_direction_10m": "wind_deg",
    "wind_gusts_10m": "wind_gust",
    "uv_index": "uv_index",
    "is_day": "is_day",
}
# Open-Meteo 15-minute variable -> PrecipitationNowcast column
NOWCAST_VARIABLES = {"precipitation": "precipitation", "snowfall": "snowfall"}
FORECAST_HOURS = 48
NOWCAST_STEPS = 8  # two hours of 15-minute steps


class OpenMeteoError(RuntimeError):
    pass


def _utc(stamp: str) -> datetime:
    # Requested with timezone=UTC, so times come back as naive UTC like "2025-10-21T14:00".
    return datetime.fromisoformat(stamp).replace(tzinfo=UTC)


def _columns(block: dict[str, Any], variables: dict[str, str]) -> list[dict[str, Any]]:
    times = block.get("time") or []
    return [
        {
            "forecast_for": _utc(stamp),
            **{
                column: (block.get(var) or [None] * len(times))[i]
                for var, column in variables.items()
            },
        }
        for i, stamp in enumerate(times)
    ]


def parse_forecast(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Hourly rows and 15-minute precipitation rows from a forecast response."""
    hours = []
    for row in _columns(payload.get("hourly") or {}, HOURLY_VARIABLES):
        if row["temp"] is None:
            continue
        # Showers are rain from convective cloud; one rain figure is what people want.
        showers = row.pop("showers")
        if row["rain"] is not None or showers is not None:
            row["rain"] = (row["rain"] or 0) + (showers or 0)
        if row["pop"] is not None:
            row["pop"] = row["pop"] / 100
        if row["is_day"] is not None:
            row["is_day"] = bool(row["is_day"])
        hours.append(row)
    quarters = [
        row
        for row in _columns(payload.get("minutely_15") or {}, NOWCAST_VARIABLES)
        if row["precipitation"] is not None
    ]
    return hours, quarters


def parse_daily(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Turn Open-Meteo's column-oriented response into rows, skipping empty days."""
    daily = payload.get("daily") or {}
    days = daily.get("time") or []
    rows = []
    for i, day in enumerate(days):
        row = {
            column: daily.get(var, [None] * len(days))[i] for var, column in DAILY_VARIABLES.items()
        }
        if all(value is None for value in row.values()):
            # The archive lags real time by a few days; trailing dates come back empty.
            continue
        rows.append({"date": date.fromisoformat(day), **row})
    return rows


class OpenMeteoClient:
    def __init__(self, settings: Settings | None = None, session: requests.Session | None = None):
        self.settings = settings or get_settings()
        self.session = session or build_session()

    def _get(self, url: str, params: dict[str, Any]) -> Any:
        try:
            response = self.session.get(
                url,
                params={
                    **params,
                    "timezone": "UTC",
                    # Match OpenWeather's metric units (m/s rather than the km/h default).
                    "wind_speed_unit": "ms",
                },
                timeout=max(self.settings.timeout_seconds, 30),
            )
        except requests.RequestException as exc:
            raise OpenMeteoError(f"Open-Meteo request failed: {type(exc).__name__}") from exc
        if not response.ok:
            try:
                reason = response.json().get("reason", response.text[:200])
            except ValueError:
                reason = response.text[:200]
            raise OpenMeteoError(f"Open-Meteo returned {response.status_code}: {reason}")
        return response.json()

    def daily_history(self, lat: float, lon: float, start: date, end: date) -> list[dict[str, Any]]:
        if start > end:
            return []
        payload = self._get(
            self.settings.open_meteo_archive_url,
            {
                "latitude": lat,
                "longitude": lon,
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
                "daily": ",".join(DAILY_VARIABLES),
            },
        )
        return parse_daily(payload)

    def forecast(self, lat: float, lon: float) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """The next 48 hours, and precipitation for the next two hours in 15-minute steps."""
        payload = self._get(
            self.settings.open_meteo_forecast_url,
            {
                "latitude": lat,
                "longitude": lon,
                "hourly": ",".join(HOURLY_VARIABLES),
                "minutely_15": ",".join(NOWCAST_VARIABLES),
                "forecast_hours": FORECAST_HOURS,
                "forecast_minutely_15": NOWCAST_STEPS,
            },
        )
        return parse_forecast(payload)
