"""Weather alerts in force for a location."""

from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from src.database.models import WeatherAlert


def active_alerts(db: Session, location_id: int, now: datetime | None = None) -> list[WeatherAlert]:
    """Alerts that haven't ended yet, soonest-ending first."""
    now = now or datetime.now(UTC)
    return list(
        db.scalars(
            select(WeatherAlert)
            .where(
                WeatherAlert.location_id == location_id,
                or_(WeatherAlert.ends_at.is_(None), WeatherAlert.ends_at > now),
            )
            .order_by(WeatherAlert.starts_at, WeatherAlert.id)
        )
    )
