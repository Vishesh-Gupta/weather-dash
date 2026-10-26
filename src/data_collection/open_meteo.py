"""Open-Meteo historical archive client (free, no API key).

https://open-meteo.com/en/docs/historical-weather-api
"""

from datetime import date
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


class OpenMeteoError(RuntimeError):
    pass


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

    def daily_history(self, lat: float, lon: float, start: date, end: date) -> list[dict[str, Any]]:
        if start > end:
            return []
        try:
            response = self.session.get(
                self.settings.open_meteo_archive_url,
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "start_date": start.isoformat(),
                    "end_date": end.isoformat(),
                    "daily": ",".join(DAILY_VARIABLES),
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
        return parse_daily(response.json())
