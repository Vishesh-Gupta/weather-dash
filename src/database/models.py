"""SQLAlchemy ORM models.

All measurements are stored in metric units (Celsius, m/s, hPa, mm) and all
timestamps in UTC. Unit conversion happens at display time.
"""

from datetime import UTC, date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator):
    """Timezone-aware UTC datetimes that round-trip identically on SQLite and Postgres."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetimes are not allowed; use timezone-aware UTC values")
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class Base(DeclarativeBase):
    pass


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (UniqueConstraint("lat", "lon", name="uq_location_coordinates"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    state: Mapped[str | None] = mapped_column(String(100))
    country: Mapped[str] = mapped_column(String(2))
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    history_backfilled_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Offset from UTC reported by OpenWeather, used to show times in local time.
    utc_offset_seconds: Mapped[int | None]

    observations: Mapped[list["WeatherObservation"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", passive_deletes=True
    )
    forecasts: Mapped[list["ForecastEntry"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", passive_deletes=True
    )
    air_quality: Mapped[list["AirQualityReading"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", passive_deletes=True
    )
    daily_history: Mapped[list["DailyHistory"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", passive_deletes=True
    )
    hourly_forecast: Mapped[list["HourlyForecast"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", passive_deletes=True
    )
    nowcast: Mapped[list["PrecipitationNowcast"]] = relationship(
        back_populates="location", cascade="all, delete-orphan", passive_deletes=True
    )

    @property
    def display_name(self) -> str:
        return ", ".join(part for part in (self.name, self.state, self.country) if part)

    def __repr__(self) -> str:
        return f"Location(id={self.id!r}, name={self.display_name!r})"


class WeatherObservation(Base):
    """Current conditions as reported by OpenWeather at `observed_at`."""

    __tablename__ = "weather_observations"
    __table_args__ = (
        UniqueConstraint("location_id", "observed_at", name="uq_observation_location_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"))
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    collected_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    temp: Mapped[float]
    feels_like: Mapped[float]
    temp_min: Mapped[float | None]
    temp_max: Mapped[float | None]
    pressure: Mapped[float | None]
    humidity: Mapped[float | None]
    visibility: Mapped[float | None]
    wind_speed: Mapped[float | None]
    wind_deg: Mapped[float | None]
    wind_gust: Mapped[float | None]
    clouds: Mapped[float | None]
    rain_1h: Mapped[float | None]
    snow_1h: Mapped[float | None]
    weather_main: Mapped[str | None] = mapped_column(String(50))
    weather_description: Mapped[str | None] = mapped_column(String(100))
    weather_icon: Mapped[str | None] = mapped_column(String(10))
    sunrise: Mapped[datetime | None] = mapped_column(UTCDateTime)
    sunset: Mapped[datetime | None] = mapped_column(UTCDateTime)

    location: Mapped[Location] = relationship(back_populates="observations")


class ForecastEntry(Base):
    """One 3-hour slot of a 5-day forecast, kept per issue time for forecast-vs-actual analysis."""

    __tablename__ = "forecast_entries"
    __table_args__ = (
        UniqueConstraint(
            "location_id", "issued_at", "forecast_for", name="uq_forecast_location_issue_slot"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"))
    issued_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    forecast_for: Mapped[datetime] = mapped_column(UTCDateTime, index=True)

    temp: Mapped[float]
    feels_like: Mapped[float | None]
    humidity: Mapped[float | None]
    pressure: Mapped[float | None]
    wind_speed: Mapped[float | None]
    wind_deg: Mapped[float | None]
    clouds: Mapped[float | None]
    pop: Mapped[float | None]
    rain_3h: Mapped[float | None]
    snow_3h: Mapped[float | None]
    weather_main: Mapped[str | None] = mapped_column(String(50))
    weather_description: Mapped[str | None] = mapped_column(String(100))
    weather_icon: Mapped[str | None] = mapped_column(String(10))

    location: Mapped[Location] = relationship(back_populates="forecasts")


class AirQualityReading(Base):
    """Air pollution reading. `aqi` uses OpenWeather's 1 (good) to 5 (very poor) scale."""

    __tablename__ = "air_quality_readings"
    __table_args__ = (
        UniqueConstraint("location_id", "observed_at", name="uq_air_quality_location_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"))
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    collected_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    aqi: Mapped[int] = mapped_column(Integer)
    co: Mapped[float | None]
    no: Mapped[float | None]
    no2: Mapped[float | None]
    o3: Mapped[float | None]
    so2: Mapped[float | None]
    pm2_5: Mapped[float | None]
    pm10: Mapped[float | None]
    nh3: Mapped[float | None]

    location: Mapped[Location] = relationship(back_populates="air_quality")


class DailyHistory(Base):
    """Daily aggregates from the Open-Meteo historical archive."""

    __tablename__ = "daily_history"
    __table_args__ = (
        UniqueConstraint("location_id", "date", name="uq_daily_history_location_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"))
    date: Mapped[date] = mapped_column(Date, index=True)

    temp_max: Mapped[float | None]
    temp_min: Mapped[float | None]
    temp_mean: Mapped[float | None]
    precipitation_sum: Mapped[float | None]
    rain_sum: Mapped[float | None]
    snowfall_sum: Mapped[float | None]
    wind_speed_max: Mapped[float | None]
    wind_gusts_max: Mapped[float | None]
    sunshine_duration: Mapped[float | None]

    location: Mapped[Location] = relationship(back_populates="daily_history")


class HourlyForecast(Base):
    """One hour of Open-Meteo's forecast for the next 48 hours.

    Only the latest issue is kept: each collection replaces the location's rows.
    """

    __tablename__ = "hourly_forecasts"
    __table_args__ = (
        UniqueConstraint("location_id", "forecast_for", name="uq_hourly_location_hour"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"))
    issued_at: Mapped[datetime] = mapped_column(UTCDateTime)
    forecast_for: Mapped[datetime] = mapped_column(UTCDateTime, index=True)

    temp: Mapped[float]
    feels_like: Mapped[float | None]
    humidity: Mapped[float | None]
    # Chance of precipitation 0–1, like OpenWeather's `pop`.
    pop: Mapped[float | None]
    # Precipitation in the hour (mm); rain includes showers; snowfall in cm.
    precipitation: Mapped[float | None]
    rain: Mapped[float | None]
    snowfall: Mapped[float | None]
    # WMO weather interpretation code.
    weather_code: Mapped[int | None] = mapped_column(Integer)
    clouds: Mapped[float | None]
    wind_speed: Mapped[float | None]
    wind_deg: Mapped[float | None]
    wind_gust: Mapped[float | None]
    uv_index: Mapped[float | None]
    is_day: Mapped[bool | None]

    location: Mapped[Location] = relationship(back_populates="hourly_forecast")


class PrecipitationNowcast(Base):
    """Precipitation over the next two hours in 15-minute steps (latest issue only)."""

    __tablename__ = "precipitation_nowcasts"
    __table_args__ = (
        UniqueConstraint("location_id", "forecast_for", name="uq_nowcast_location_slot"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id", ondelete="CASCADE"))
    issued_at: Mapped[datetime] = mapped_column(UTCDateTime)
    # Start of the 15-minute slot.
    forecast_for: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    # mm in the 15 minutes; snowfall in cm.
    precipitation: Mapped[float | None]
    snowfall: Mapped[float | None]

    location: Mapped[Location] = relationship(back_populates="nowcast")


class CollectionRun(Base):
    """Audit record of each scheduler run."""

    __tablename__ = "collection_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    status: Mapped[str] = mapped_column(String(20), default="running")
    locations_processed: Mapped[int] = mapped_column(default=0)
    errors: Mapped[str | None] = mapped_column(Text)
    # Comma-separated data kinds collected in this run, e.g. "current,air_quality".
    kinds: Mapped[str | None] = mapped_column(String(100))
