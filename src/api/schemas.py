"""Response and request models. Values are metric; timestamps are UTC (ISO 8601)."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LocationOut(ORMModel):
    id: int
    name: str
    state: str | None
    country: str
    display_name: str
    lat: float
    lon: float
    utc_offset_seconds: int | None


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    state: str | None = Field(default=None, max_length=100)
    country: str = Field(min_length=2, max_length=2)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class GeocodeResult(BaseModel):
    name: str
    state: str | None
    country: str
    lat: float
    lon: float
    display_name: str


class ObservationOut(ORMModel):
    observed_at: datetime
    temp: float
    feels_like: float
    temp_min: float | None
    temp_max: float | None
    pressure: float | None
    humidity: float | None
    visibility: float | None
    wind_speed: float | None
    wind_deg: float | None
    wind_gust: float | None
    clouds: float | None
    rain_1h: float | None
    snow_1h: float | None
    weather_main: str | None
    weather_description: str | None
    weather_icon: str | None
    sunrise: datetime | None
    sunset: datetime | None


class ForecastEntryOut(ORMModel):
    forecast_for: datetime
    temp: float
    feels_like: float | None
    humidity: float | None
    pressure: float | None
    wind_speed: float | None
    wind_deg: float | None
    clouds: float | None
    pop: float | None
    rain_3h: float | None
    snow_3h: float | None
    weather_main: str | None
    weather_description: str | None
    weather_icon: str | None


class ForecastOut(BaseModel):
    issued_at: datetime | None
    entries: list[ForecastEntryOut]


class HourlyEntryOut(ORMModel):
    forecast_for: datetime
    temp: float
    feels_like: float | None
    humidity: float | None
    pop: float | None = Field(description="Chance of precipitation, 0–1")
    precipitation: float | None = Field(description="mm in the hour")
    rain: float | None = Field(description="mm in the hour, showers included")
    snowfall: float | None = Field(description="cm in the hour")
    weather_code: int | None = Field(description="WMO weather interpretation code")
    clouds: float | None
    wind_speed: float | None
    wind_deg: float | None
    wind_gust: float | None
    uv_index: float | None
    is_day: bool | None


class NowcastEntryOut(ORMModel):
    forecast_for: datetime = Field(description="Start of the 15-minute slot")
    precipitation: float | None = Field(description="mm in the 15 minutes")
    snowfall: float | None = Field(description="cm in the 15 minutes")


class HourlyOut(BaseModel):
    issued_at: datetime | None
    hours: list[HourlyEntryOut]
    nowcast: list[NowcastEntryOut]


class AlertOut(ORMModel):
    sender: str | None = Field(description="The issuing agency")
    event: str = Field(description='The alert\'s name, e.g. "Severe Thunderstorm Warning"')
    starts_at: datetime | None
    ends_at: datetime | None
    description: str | None
    tags: list[str] = Field(description="Categories such as Wind or Flood")

    @field_validator("tags", mode="before")
    @classmethod
    def split_tags(cls, value: str | list[str] | None) -> list[str]:
        if isinstance(value, list):
            return value
        return [tag for tag in (value or "").split(",") if tag]


class AirQualityOut(ORMModel):
    observed_at: datetime
    aqi: int = Field(
        description="OpenWeather index: 1 good, 2 fair, 3 moderate, 4 poor, 5 very poor"
    )
    co: float | None
    no: float | None
    no2: float | None
    o3: float | None
    so2: float | None
    pm2_5: float | None
    pm10: float | None
    nh3: float | None


class DailyHistoryOut(ORMModel):
    date: date
    temp_max: float | None
    temp_min: float | None
    temp_mean: float | None
    precipitation_sum: float | None
    rain_sum: float | None
    snowfall_sum: float | None
    wind_speed_max: float | None
    wind_gusts_max: float | None
    sunshine_duration: float | None = Field(description="Seconds of sunshine")


class CollectionRunOut(ORMModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    locations_processed: int
    errors: str | None
    kinds: str | None = Field(description="Comma-separated data kinds collected in the run")


class ExtremeOut(ORMModel):
    value: float
    date: date


class NormalOut(ORMModel):
    """Typical weather for a date, from the same time of year in earlier years."""

    date: date
    years: int = Field(description="Number of earlier years the normal is based on")
    temp_max: float | None
    temp_min: float | None
    temp_mean: float | None
    precipitation: float | None = Field(description="Average daily precipitation, mm")
    wet_day_chance: float | None = Field(description="Share of days with at least 1 mm (0–1)")
    record_high: ExtremeOut | None
    record_low: ExtremeOut | None


class TodayRange(BaseModel):
    high: float
    low: float


class OverviewItem(BaseModel):
    location: LocationOut
    current: ObservationOut | None
    air_quality: AirQualityOut | None
    today: TodayRange | None = Field(
        description="Forecast high and low for the location's current day"
    )
    normal: NormalOut | None = Field(description="Normal for the location's current day")
    alerts: list[AlertOut] = Field(description="Weather alerts in force")


class SessionOut(BaseModel):
    is_admin: bool = Field(description="Whether this browser may manage locations")
    auth_required: bool = Field(description="Whether an admin password is configured")
    can_collect: bool = Field(description="Whether an OpenWeather API key is configured")
    alerts_enabled: bool = Field(
        description="Whether weather alerts are collected (OpenWeather One Call 3.0)"
    )


class SignIn(BaseModel):
    password: str = Field(max_length=1024)


class CollectRequest(BaseModel):
    location_ids: list[int] | None = None


class HealthOut(BaseModel):
    status: str
    database: str
