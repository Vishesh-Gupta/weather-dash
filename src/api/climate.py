"""Climate normals from the stored daily history.

A day's "normal" averages the same part of the year in *earlier years*: every
stored day within `window` days of the same calendar date (wrapping across the
new year). Days from the current season are excluded, so recent weather never
counts towards its own baseline.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from statistics import fmean

WET_DAY_MM = 1.0
# A matching calendar date this close is the same season, not an earlier year.
MIN_YEARS_APART_DAYS = 180


@dataclass(frozen=True)
class DailyRecord:
    date: date
    temp_max: float | None
    temp_min: float | None
    temp_mean: float | None
    precipitation_sum: float | None


@dataclass(frozen=True)
class Extreme:
    value: float
    date: date


@dataclass(frozen=True)
class Normal:
    date: date
    years: int
    temp_max: float | None
    temp_min: float | None
    temp_mean: float | None
    precipitation: float | None
    wet_day_chance: float | None
    record_high: Extreme | None
    record_low: Extreme | None


def _day_of_year(d: date) -> int:
    # Use a leap year so Feb 29 has a place and other dates line up across years.
    return d.replace(year=2000).timetuple().tm_yday


def _circular_distance(a: int, b: int, length: int = 366) -> int:
    diff = abs(a - b) % length
    return min(diff, length - diff)


def _mean(values: Iterable[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return fmean(present) if present else None


def normal_for(
    day: date, history: Sequence[DailyRecord], window: int = 7, before: date | None = None
) -> Normal:
    cutoff = before or day
    target = _day_of_year(day)
    nearby = [
        r
        for r in history
        if r.date < cutoff
        and (day - r.date).days >= MIN_YEARS_APART_DAYS
        and _circular_distance(_day_of_year(r.date), target) <= window
    ]
    precipitation = [r.precipitation_sum for r in nearby if r.precipitation_sum is not None]
    highs = [r for r in nearby if r.temp_max is not None]
    lows = [r for r in nearby if r.temp_min is not None]
    record_high = max(highs, key=lambda r: r.temp_max, default=None)
    record_low = min(lows, key=lambda r: r.temp_min, default=None)
    return Normal(
        date=day,
        years=len({r.date.year for r in nearby}),
        temp_max=_mean(r.temp_max for r in nearby),
        temp_min=_mean(r.temp_min for r in nearby),
        temp_mean=_mean(r.temp_mean for r in nearby),
        precipitation=fmean(precipitation) if precipitation else None,
        wet_day_chance=(
            sum(p >= WET_DAY_MM for p in precipitation) / len(precipitation)
            if precipitation
            else None
        ),
        record_high=Extreme(record_high.temp_max, record_high.date) if record_high else None,
        record_low=Extreme(record_low.temp_min, record_low.date) if record_low else None,
    )


def normals_between(
    start: date, end: date, history: Sequence[DailyRecord], window: int = 7
) -> list[Normal]:
    days = (end - start).days + 1
    return [
        normal_for(start + timedelta(days=i), history, window, before=start) for i in range(days)
    ]
