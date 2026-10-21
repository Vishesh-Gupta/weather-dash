"""Queries over stored daily history used by the normals and overview endpoints."""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from src.api.climate import DailyRecord, Normal, normals_between
from src.database.models import DailyHistory, Location


def location_today(location: Location, now: datetime | None = None) -> date:
    now = now or datetime.now(UTC)
    return (now + timedelta(seconds=location.utc_offset_seconds or 0)).date()


def _shift_year(day: date, year: int) -> date:
    try:
        return day.replace(year=year)
    except ValueError:  # Feb 29 in a non-leap year
        return day.replace(year=year, day=28)


def history_near(
    session: Session, location_id: int, start: date, end: date, window: int
) -> list[DailyRecord]:
    """Daily rows from earlier years within `window` days of the start–end dates."""
    first_year = session.scalar(
        select(func.min(DailyHistory.date)).where(DailyHistory.location_id == location_id)
    )
    if first_year is None:
        return []
    ranges = []
    span_years = end.year - start.year
    for year in range(first_year.year, start.year + 1):
        lo = _shift_year(start, year) - timedelta(days=window)
        hi = _shift_year(end, year + span_years) + timedelta(days=window)
        ranges.append(DailyHistory.date.between(lo, hi))
    rows = session.execute(
        select(
            DailyHistory.date,
            DailyHistory.temp_max,
            DailyHistory.temp_min,
            DailyHistory.temp_mean,
            DailyHistory.precipitation_sum,
        ).where(DailyHistory.location_id == location_id, or_(*ranges))
    ).all()
    return [DailyRecord(*row) for row in rows]


def normals(
    session: Session, location_id: int, start: date, end: date, window: int = 7
) -> list[Normal]:
    return normals_between(
        start, end, history_near(session, location_id, start, end, window), window
    )
