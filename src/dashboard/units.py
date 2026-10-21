"""Conversion from stored metric values to the selected display units."""

from dataclasses import dataclass
from enum import StrEnum


class UnitSystem(StrEnum):
    METRIC = "metric"
    IMPERIAL = "imperial"


@dataclass(frozen=True)
class Units:
    system: UnitSystem

    @property
    def is_metric(self) -> bool:
        return self.system is UnitSystem.METRIC

    @property
    def temp_label(self) -> str:
        return "°C" if self.is_metric else "°F"

    @property
    def wind_label(self) -> str:
        return "km/h" if self.is_metric else "mph"

    @property
    def precip_label(self) -> str:
        return "mm" if self.is_metric else "in"

    @property
    def distance_label(self) -> str:
        return "km" if self.is_metric else "mi"

    def temp(self, celsius):
        return celsius if self.is_metric else celsius * 9 / 5 + 32

    def temp_delta(self, celsius_delta):
        """Convert a temperature difference (no offset)."""
        return celsius_delta if self.is_metric else celsius_delta * 9 / 5

    def wind(self, meters_per_second):
        return meters_per_second * 3.6 if self.is_metric else meters_per_second * 2.236936

    def precip(self, millimeters):
        return millimeters if self.is_metric else millimeters / 25.4

    def distance(self, meters):
        return meters / 1000 if self.is_metric else meters / 1609.344


COMPASS_POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]  # fmt: skip


def compass(degrees: float | None) -> str:
    if degrees is None:
        return ""
    return COMPASS_POINTS[round(degrees % 360 / 22.5) % 16]
