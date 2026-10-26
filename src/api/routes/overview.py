from datetime import UTC, datetime, time, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from src.api.alerts import active_alerts
from src.api.deps import DbSession
from src.api.history import location_today, normals
from src.api.schemas import OverviewItem, TodayRange
from src.database import repository
from src.database.models import AirQualityReading, ForecastEntry, Location, WeatherObservation

router = APIRouter(tags=["locations"])


def _latest(db, model, location_id: int):
    return db.scalar(
        select(model)
        .where(model.location_id == location_id)
        .order_by(model.observed_at.desc())
        .limit(1)
    )


def _today_range(db, location: Location) -> TodayRange | None:
    """High and low for the location's whole day: readings so far, then the latest forecast."""
    offset = timedelta(seconds=location.utc_offset_seconds or 0)
    today = location_today(location)
    midnight = datetime.combine(today, time(), tzinfo=UTC) - offset
    observed = db.execute(
        select(func.max(WeatherObservation.temp), func.min(WeatherObservation.temp)).where(
            WeatherObservation.location_id == location.id,
            WeatherObservation.observed_at >= midnight,
            WeatherObservation.observed_at < midnight + timedelta(days=1),
        )
    ).one()
    temps = [t for t in observed if t is not None]
    issued = db.scalar(
        select(func.max(ForecastEntry.issued_at)).where(ForecastEntry.location_id == location.id)
    )
    if issued is not None:
        temps += db.scalars(
            select(ForecastEntry.temp).where(
                ForecastEntry.location_id == location.id,
                ForecastEntry.issued_at == issued,
                ForecastEntry.forecast_for >= midnight,
                ForecastEntry.forecast_for < midnight + timedelta(days=1),
            )
        ).all()
    return TodayRange(high=max(temps), low=min(temps)) if temps else None


@router.get("/overview", response_model=list[OverviewItem])
def overview(db: DbSession):
    """Every tracked location's latest conditions in one request, for the home page."""
    items = []
    for location in repository.list_locations(db):
        current = _latest(db, WeatherObservation, location.id)
        today = location_today(location)
        normal = normals(db, location.id, today, today)
        items.append(
            OverviewItem(
                location=location,
                current=current,
                air_quality=_latest(db, AirQualityReading, location.id),
                today=_today_range(db, location),
                normal=normal[0] if normal and normal[0].years else None,
                alerts=active_alerts(db, location.id),
            )
        )
    return items
