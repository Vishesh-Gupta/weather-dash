"""OpenWeatherMap API client (free tier endpoints).

Responses are requested in metric units and converted to plain dicts whose keys
match the columns of the corresponding database models.
"""

import contextlib
from datetime import UTC, datetime
from typing import Any

import requests

from src.data_collection.http import RateLimiter, build_session
from src.utils.config import Settings, get_settings


class OpenWeatherError(RuntimeError):
    """Raised when the OpenWeather API returns an error or an unusable response."""


def _ts(value: int | None) -> datetime | None:
    return datetime.fromtimestamp(value, UTC) if value is not None else None


def _weather_fields(payload: dict[str, Any]) -> dict[str, Any]:
    weather = (payload.get("weather") or [{}])[0]
    return {
        "weather_main": weather.get("main"),
        "weather_description": weather.get("description"),
        "weather_icon": weather.get("icon"),
    }


def parse_current(payload: dict[str, Any]) -> dict[str, Any]:
    main = payload["main"]
    wind = payload.get("wind", {})
    sys = payload.get("sys", {})
    return {
        "observed_at": _ts(payload["dt"]),
        "temp": main["temp"],
        "feels_like": main["feels_like"],
        "temp_min": main.get("temp_min"),
        "temp_max": main.get("temp_max"),
        "pressure": main.get("pressure"),
        "humidity": main.get("humidity"),
        "visibility": payload.get("visibility"),
        "wind_speed": wind.get("speed"),
        "wind_deg": wind.get("deg"),
        "wind_gust": wind.get("gust"),
        "clouds": payload.get("clouds", {}).get("all"),
        "rain_1h": payload.get("rain", {}).get("1h"),
        "snow_1h": payload.get("snow", {}).get("1h"),
        "sunrise": _ts(sys.get("sunrise")),
        "sunset": _ts(sys.get("sunset")),
        "utc_offset_seconds": payload.get("timezone"),
        **_weather_fields(payload),
    }


def parse_forecast(payload: dict[str, Any]) -> list[dict[str, Any]]:
    entries = []
    for item in payload.get("list", []):
        main = item["main"]
        wind = item.get("wind", {})
        entries.append(
            {
                "forecast_for": _ts(item["dt"]),
                "temp": main["temp"],
                "feels_like": main.get("feels_like"),
                "humidity": main.get("humidity"),
                "pressure": main.get("pressure"),
                "wind_speed": wind.get("speed"),
                "wind_deg": wind.get("deg"),
                "clouds": item.get("clouds", {}).get("all"),
                "pop": item.get("pop"),
                "rain_3h": item.get("rain", {}).get("3h"),
                "snow_3h": item.get("snow", {}).get("3h"),
                **_weather_fields(item),
            }
        )
    return entries


def parse_air_quality(payload: dict[str, Any]) -> dict[str, Any] | None:
    items = payload.get("list") or []
    if not items:
        return None
    item = items[0]
    components = item.get("components", {})
    return {
        "observed_at": _ts(item["dt"]),
        "aqi": item["main"]["aqi"],
        **{
            key: components.get(key)
            for key in ("co", "no", "no2", "o3", "so2", "pm2_5", "pm10", "nh3")
        },
    }


def parse_geocoding(payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "name": item["name"],
            "state": item.get("state"),
            "country": item["country"],
            "lat": item["lat"],
            "lon": item["lon"],
            "display_name": ", ".join(
                part for part in (item["name"], item.get("state"), item["country"]) if part
            ),
        }
        for item in payload
    ]


class OpenWeatherClient:
    def __init__(
        self,
        settings: Settings | None = None,
        session: requests.Session | None = None,
        rate_limiter: RateLimiter | None = None,
    ):
        self.settings = settings or get_settings()
        if not self.settings.api_key:
            raise OpenWeatherError(
                "WEATHER_API_KEY is not set. Add it to your environment or .env file."
            )
        self.session = session or build_session()
        self.rate_limiter = rate_limiter or RateLimiter(self.settings.request_delay_seconds)

    def _get(self, path: str, **params: Any) -> Any:
        self.rate_limiter.wait()
        url = f"{self.settings.openweather_url}/{path}"
        try:
            response = self.session.get(
                url,
                params={**params, "appid": self.settings.api_key},
                timeout=self.settings.timeout_seconds,
            )
        except requests.RequestException as exc:
            raise OpenWeatherError(f"Request to {path} failed: {exc}") from exc

        if response.status_code == 401:
            raise OpenWeatherError("OpenWeather rejected the API key (401). Check WEATHER_API_KEY.")
        if not response.ok:
            message = response.text[:200]
            with contextlib.suppress(ValueError):
                message = response.json().get("message", message)
            raise OpenWeatherError(f"{path} returned {response.status_code}: {message}")
        return response.json()

    def geocode(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        return parse_geocoding(self._get("geo/1.0/direct", q=query, limit=limit))

    def current(self, lat: float, lon: float) -> dict[str, Any]:
        return parse_current(self._get("data/2.5/weather", lat=lat, lon=lon, units="metric"))

    def forecast(self, lat: float, lon: float) -> list[dict[str, Any]]:
        return parse_forecast(self._get("data/2.5/forecast", lat=lat, lon=lon, units="metric"))

    def air_quality(self, lat: float, lon: float) -> dict[str, Any] | None:
        return parse_air_quality(self._get("data/2.5/air_pollution", lat=lat, lon=lon))
