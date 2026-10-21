"""Deterministic sample data for dashboard tests and local previews."""

import math
from datetime import UTC, date, datetime, timedelta

from src.database import repository
from src.database.models import (
    AirQualityReading,
    CollectionRun,
    DailyHistory,
    ForecastEntry,
    WeatherObservation,
)
from src.database.session import session_scope


def seed(now: datetime | None = None, history_days: int = 730) -> int:
    """Populate one location with a week of observations, a forecast, air quality and history."""
    now = (now or datetime.now(UTC)).replace(minute=0, second=0, microsecond=0)
    with session_scope() as session:
        loc = repository.add_location(
            session, name="Toronto", state="Ontario", country="CA", lat=43.6535, lon=-79.3839
        )
        loc.utc_offset_seconds = -14400
        loc.history_backfilled_at = now

        for h in range(7 * 24, -1, -1):
            t = now - timedelta(hours=h)
            temp = 11 + 6 * math.sin((t.hour - 9) / 24 * 2 * math.pi) + math.sin(h / 30)
            session.add(
                WeatherObservation(
                    location_id=loc.id,
                    observed_at=t,
                    collected_at=t,
                    temp=temp,
                    feels_like=temp - 1.5,
                    temp_min=temp - 1,
                    temp_max=temp + 1,
                    pressure=1015 + math.sin(h / 20) * 6,
                    humidity=65,
                    visibility=10000,
                    wind_speed=4.5,
                    wind_deg=250,
                    wind_gust=8.0,
                    clouds=40,
                    weather_main="Clouds",
                    weather_description="scattered clouds",
                    weather_icon="03d",
                    sunrise=t.replace(hour=11, minute=24),
                    sunset=t.replace(hour=22, minute=15),
                )
            )
            if h % 3 == 0:
                session.add(
                    AirQualityReading(
                        location_id=loc.id,
                        observed_at=t,
                        collected_at=t,
                        aqi=2 + (h // 24) % 3,
                        co=210.0,
                        no=0.3,
                        no2=14 + h % 7,
                        o3=58.0,
                        so2=1.2,
                        pm2_5=6 + 4 * math.sin(h / 11) ** 2,
                        pm10=10 + 5 * math.sin(h / 13) ** 2,
                        nh3=0.9,
                    )
                )

        for slot in range(40):
            t = now + timedelta(hours=3 * (slot + 1))
            rainy = 10 <= slot <= 16
            session.add(
                ForecastEntry(
                    location_id=loc.id,
                    issued_at=now,
                    forecast_for=t,
                    temp=10 + 5 * math.sin((t.hour - 9) / 24 * 2 * math.pi) - slot * 0.05,
                    feels_like=8 + 5 * math.sin((t.hour - 9) / 24 * 2 * math.pi),
                    humidity=70,
                    pressure=1014,
                    wind_speed=5.0,
                    wind_deg=240,
                    clouds=80 if rainy else 30,
                    pop=0.8 if rainy else 0.1,
                    rain_3h=1.2 if rainy else None,
                    snow_3h=0.4 if slot == 30 else None,
                    weather_main="Rain" if rainy else "Clouds",
                    weather_description="light rain" if rainy else "scattered clouds",
                    weather_icon="10d",
                )
            )

        today = now.date()
        for d in range(history_days, 0, -1):
            day = today - timedelta(days=d)
            season = -math.cos((day.timetuple().tm_yday - 15) / 365 * 2 * math.pi)
            mean = 9 + 13 * season + 3 * math.sin(d / 5)
            session.add(
                DailyHistory(
                    location_id=loc.id,
                    date=day,
                    temp_mean=mean,
                    temp_max=mean + 5,
                    temp_min=mean - 5,
                    precipitation_sum=max(0.0, 6 * math.sin(d / 3.1)),
                    rain_sum=max(0.0, 6 * math.sin(d / 3.1)),
                    snowfall_sum=0.0,
                    wind_speed_max=7.0,
                    wind_gusts_max=13.0,
                    sunshine_duration=25000.0,
                )
            )

        session.add(
            CollectionRun(started_at=now, finished_at=now, status="success", locations_processed=1)
        )
        session.flush()
        return loc.id


def history_start(now: datetime, days: int = 730) -> date:
    return now.date() - timedelta(days=days)


if __name__ == "__main__":
    from src.database.setup import init_db

    init_db()
    print(f"Seeded location {seed()}")
