"""Data access helpers for locations."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database.models import Location

# ~11 m precision; enough to treat geocoder results for the same place as identical.
COORDINATE_PRECISION = 4


def _round(value: float) -> float:
    return round(value, COORDINATE_PRECISION)


def get_location_by_coordinates(session: Session, lat: float, lon: float) -> Location | None:
    return session.scalar(
        select(Location).where(Location.lat == _round(lat), Location.lon == _round(lon))
    )


def add_location(
    session: Session,
    *,
    name: str,
    country: str,
    lat: float,
    lon: float,
    state: str | None = None,
) -> Location:
    """Track a location, reactivating it if it was previously added."""
    existing = get_location_by_coordinates(session, lat, lon)
    if existing:
        existing.is_active = True
        return existing

    location = Location(
        name=name, state=state or None, country=country, lat=_round(lat), lon=_round(lon)
    )
    session.add(location)
    session.flush()
    return location


def list_locations(session: Session, *, active_only: bool = True) -> list[Location]:
    query = select(Location).order_by(Location.name, Location.country)
    if active_only:
        query = query.where(Location.is_active.is_(True))
    return list(session.scalars(query))


def set_location_active(session: Session, location_id: int, active: bool) -> Location | None:
    location = session.get(Location, location_id)
    if location:
        location.is_active = active
    return location


def delete_location(session: Session, location_id: int) -> bool:
    """Remove a location and all of its collected data."""
    location = session.get(Location, location_id)
    if not location:
        return False
    session.delete(location)
    return True
