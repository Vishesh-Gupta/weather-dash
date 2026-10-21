from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Response, status
from sqlalchemy import func, select

from src.api.collection import start_collection
from src.api.deps import AdminOnly, DbSession, NeedsApiKey
from src.api.history import location_today, normals
from src.api.schemas import (
    AirQualityOut,
    DailyHistoryOut,
    ForecastOut,
    LocationCreate,
    LocationOut,
    NormalOut,
    ObservationOut,
)
from src.database import repository
from src.database.models import (
    AirQualityReading,
    DailyHistory,
    ForecastEntry,
    Location,
    WeatherObservation,
)

router = APIRouter(prefix="/locations", tags=["locations"])

RecentDays = Annotated[int, Query(ge=1, le=90, description="How many days back to include")]


def get_location_or_404(db, location_id: int) -> Location:
    location = db.get(Location, location_id)
    if location is None or not location.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
    return location


def since(days: int) -> datetime:
    return datetime.now(UTC) - timedelta(days=days)


@router.get("", response_model=list[LocationOut])
def list_locations(db: DbSession):
    return repository.list_locations(db)


@router.get("/{location_id}", response_model=LocationOut)
def get_location(location_id: int, db: DbSession):
    return get_location_or_404(db, location_id)


@router.get("/{location_id}/current", response_model=ObservationOut | None)
def current_conditions(location_id: int, db: DbSession):
    get_location_or_404(db, location_id)
    return db.scalar(
        select(WeatherObservation)
        .where(WeatherObservation.location_id == location_id)
        .order_by(WeatherObservation.observed_at.desc())
        .limit(1)
    )


@router.get("/{location_id}/observations", response_model=list[ObservationOut])
def observations(location_id: int, db: DbSession, days: RecentDays = 7):
    get_location_or_404(db, location_id)
    return db.scalars(
        select(WeatherObservation)
        .where(
            WeatherObservation.location_id == location_id,
            WeatherObservation.observed_at >= since(days),
        )
        .order_by(WeatherObservation.observed_at)
    ).all()


@router.get("/{location_id}/forecast", response_model=ForecastOut)
def forecast(location_id: int, db: DbSession):
    """The most recently issued 5-day forecast in 3-hour steps."""
    get_location_or_404(db, location_id)
    issued_at = db.scalar(
        select(func.max(ForecastEntry.issued_at)).where(ForecastEntry.location_id == location_id)
    )
    entries = []
    if issued_at is not None:
        entries = db.scalars(
            select(ForecastEntry)
            .where(ForecastEntry.location_id == location_id, ForecastEntry.issued_at == issued_at)
            .order_by(ForecastEntry.forecast_for)
        ).all()
    return ForecastOut(issued_at=issued_at, entries=entries)


@router.get("/{location_id}/air-quality", response_model=list[AirQualityOut])
def air_quality(location_id: int, db: DbSession, days: RecentDays = 7):
    get_location_or_404(db, location_id)
    return db.scalars(
        select(AirQualityReading)
        .where(
            AirQualityReading.location_id == location_id,
            AirQualityReading.observed_at >= since(days),
        )
        .order_by(AirQualityReading.observed_at)
    ).all()


@router.get("/{location_id}/history", response_model=list[DailyHistoryOut])
def history(
    location_id: int,
    db: DbSession,
    start: Annotated[date | None, Query(description="First day (inclusive)")] = None,
    end: Annotated[date | None, Query(description="Last day (inclusive)")] = None,
):
    """Daily history from the Open-Meteo archive."""
    get_location_or_404(db, location_id)
    if start and end and start > end:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "start must not be after end")
    query = select(DailyHistory).where(DailyHistory.location_id == location_id)
    if start:
        query = query.where(DailyHistory.date >= start)
    if end:
        query = query.where(DailyHistory.date <= end)
    return db.scalars(query.order_by(DailyHistory.date)).all()


MAX_NORMAL_DAYS = 31


@router.get("/{location_id}/normals", response_model=list[NormalOut])
def location_normals(
    location_id: int,
    db: DbSession,
    start: Annotated[
        date | None, Query(description="First day; defaults to today at the location")
    ] = None,
    end: Annotated[
        date | None, Query(description="Last day (inclusive); defaults to start")
    ] = None,
    window: Annotated[int, Query(ge=1, le=15, description="Days either side of each date")] = 7,
):
    """Typical weather for each day, from the same dates in earlier years of history."""
    location = get_location_or_404(db, location_id)
    start = start or location_today(location)
    end = end or start
    if start > end:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "start must not be after end")
    if (end - start).days + 1 > MAX_NORMAL_DAYS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, f"At most {MAX_NORMAL_DAYS} days per request"
        )
    return normals(db, location_id, start, end, window)


@router.post(
    "",
    response_model=LocationOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[AdminOnly, NeedsApiKey],
)
def create_location(body: LocationCreate, db: DbSession, background: BackgroundTasks):
    """Track a location and collect its data in the background.

    If a collection is already running, the new location is picked up by the next one.
    """
    location = repository.add_location(db, **body.model_dump())
    db.commit()
    start_collection(background, [location.id])
    return location


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[AdminOnly])
def delete_location(location_id: int, db: DbSession):
    if not repository.delete_location(db, location_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Location not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
