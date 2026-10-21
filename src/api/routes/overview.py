from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

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


def _today_range(db, location: Location, current: WeatherObservation | None) -> TodayRange | None:
    """High and low for the rest of the location's day from the latest forecast."""
    issued = db.scalar(
        select(func.max(ForecastEntry.issued_at)).where(ForecastEntry.location_id == location.id)
    )
    if issued is None:
        return None
    offset = timedelta(seconds=location.utc_offset_seconds or 0)
    today = location_today(location)
    temps = [
        entry.temp
        for entry in db.scalars(
            select(ForecastEntry).where(
                ForecastEntry.location_id == location.id, ForecastEntry.issued_at == issued
            )
        )
        if (entry.forecast_for + offset).date() == today
    ]
    if current is not None and (current.observed_at + offset).date() == today:
        temps.append(current.temp)
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
                today=_today_range(db, location, current),
                normal=normal[0] if normal and normal[0].years else None,
            )
        )
    return items
