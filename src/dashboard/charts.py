"""Plotly figure builders. Inputs are DataFrames from `src.dashboard.data` (metric units).

Colors follow a fixed categorical order so a series keeps its color everywhere;
status colors are reserved for air quality levels and always paired with a label.
"""

import math

import pandas as pd
import plotly.graph_objects as go

from src.dashboard.units import Units

SERIES = {
    "blue": "#2a78d6",
    "orange": "#eb6834",
    "aqua": "#1baf7a",
}
BAND_FILL = "rgba(42, 120, 214, 0.18)"
STATUS = {"good": "#0ca30c", "warning": "#fab219", "serious": "#ec835a", "critical": "#d03b3b"}
MUTED = "#898781"


def _layout(fig: go.Figure, *, y_title: str, height: int = 320, legend: bool = True) -> go.Figure:
    fig.update_layout(
        height=height,
        margin={"l": 8, "r": 8, "t": 32, "b": 8},
        font={"family": 'system-ui, -apple-system, "Segoe UI", sans-serif'},
        hovermode="x unified",
        showlegend=legend,
        legend={"orientation": "h", "yanchor": "bottom", "y": 1.02, "x": 0},
        bargap=0.25,
    )
    fig.update_yaxes(title_text=y_title, zeroline=False)
    fig.update_xaxes(showgrid=False)
    return fig


def _line(x, y, name: str, color: str, **kwargs) -> go.Scatter:
    return go.Scatter(
        x=x, y=y, name=name, mode="lines", line={"color": color, "width": 2}, **kwargs
    )


def _bar(x, y, name: str, color: str, **kwargs) -> go.Bar:
    return go.Bar(x=x, y=y, name=name, marker={"color": color, "cornerradius": 4}, **kwargs)


def forecast_temperature(df: pd.DataFrame, units: Units) -> go.Figure:
    fmt = f"%{{y:.1f}}{units.temp_label}"
    fig = go.Figure(
        [
            _line(
                df["forecast_for"],
                units.temp(df["temp"]),
                "Temperature",
                SERIES["blue"],
                hovertemplate=fmt,
            ),
            _line(
                df["forecast_for"],
                units.temp(df["feels_like"]),
                "Feels like",
                SERIES["orange"],
                hovertemplate=fmt,
            ),
        ]
    )
    return _layout(fig, y_title=units.temp_label)


def forecast_precipitation_chance(df: pd.DataFrame) -> go.Figure:
    fig = go.Figure(
        _bar(
            df["forecast_for"],
            df["pop"] * 100,
            "Chance of precipitation",
            SERIES["blue"],
            hovertemplate="%{y:.0f}%",
        )
    )
    fig.update_yaxes(range=[0, 100], ticksuffix="%")
    return _layout(fig, y_title="Chance", height=240, legend=False)


def forecast_precipitation_amount(df: pd.DataFrame, units: Units) -> go.Figure:
    fmt = f"%{{y:.2f}} {units.precip_label}"
    fig = go.Figure(
        [
            _bar(
                df["forecast_for"],
                units.precip(df["rain_3h"]),
                "Rain",
                SERIES["blue"],
                hovertemplate=fmt,
            ),
            _bar(
                df["forecast_for"],
                units.precip(df["snow_3h"]),
                "Snow",
                SERIES["aqua"],
                hovertemplate=fmt,
            ),
        ]
    )
    fig.update_layout(barmode="stack", legend_traceorder="normal")
    return _layout(fig, y_title=f"{units.precip_label} per 3 h", height=240)


def observed_temperature(df: pd.DataFrame, units: Units) -> go.Figure:
    fmt = f"%{{y:.1f}}{units.temp_label}"
    fig = go.Figure(
        [
            _line(
                df["observed_at"],
                units.temp(df["temp"]),
                "Temperature",
                SERIES["blue"],
                hovertemplate=fmt,
            ),
            _line(
                df["observed_at"],
                units.temp(df["feels_like"]),
                "Feels like",
                SERIES["orange"],
                hovertemplate=fmt,
            ),
        ]
    )
    return _layout(fig, y_title=units.temp_label)


def particulate_trend(df: pd.DataFrame) -> go.Figure:
    fmt = "%{y:.1f} µg/m³"
    fig = go.Figure(
        [
            _line(df["observed_at"], df["pm2_5"], "PM2.5", SERIES["blue"], hovertemplate=fmt),
            _line(df["observed_at"], df["pm10"], "PM10", SERIES["orange"], hovertemplate=fmt),
        ]
    )
    return _layout(fig, y_title="µg/m³")


POLLUTANT_LABELS = {
    "pm2_5": "PM2.5", "pm10": "PM10", "o3": "O₃", "no2": "NO₂",
    "so2": "SO₂", "no": "NO", "nh3": "NH₃", "co": "CO",
}  # fmt: skip


def pollutant_breakdown(reading: pd.Series) -> go.Figure:
    names = list(POLLUTANT_LABELS)
    values = [reading.get(name) for name in names]
    fig = go.Figure(
        go.Bar(
            x=values,
            y=[POLLUTANT_LABELS[n] for n in names],
            orientation="h",
            marker={"color": SERIES["blue"], "cornerradius": 4},
            text=[f"{v:.1f}" if v is not None else "" for v in values],
            textposition="outside",
            cliponaxis=False,
            hovertemplate="%{y}: %{x:.2f} µg/m³<extra></extra>",
        )
    )
    present = [v for v in values if v]
    fig.update_xaxes(
        type="log",
        title_text="µg/m³ (log scale)",
        showgrid=True,
        dtick=1,
        # Leave headroom on the right for the value labels.
        range=[-1, max(3, math.log10(max(present)) + 0.6)] if present else None,
    )
    fig.update_yaxes(autorange="reversed")
    fig.update_layout(hovermode="closest")
    return _layout(fig, y_title="", height=300, legend=False)


def history_temperature(df: pd.DataFrame, units: Units) -> go.Figure:
    fmt = f"%{{y:.1f}}{units.temp_label}"
    fig = go.Figure(
        [
            go.Scatter(
                x=df["date"], y=units.temp(df["temp_max"]), name="Daily high", mode="lines",
                line={"width": 0}, hovertemplate=fmt, showlegend=False,
            ),
            go.Scatter(
                x=df["date"], y=units.temp(df["temp_min"]), name="Daily low", mode="lines",
                line={"width": 0}, fill="tonexty", fillcolor=BAND_FILL, hovertemplate=fmt,
                showlegend=False,
            ),
            _line(df["date"], units.temp(df["temp_mean"]), "Daily mean", SERIES["blue"], hovertemplate=fmt),
        ]
    )  # fmt: skip
    return _layout(fig, y_title=units.temp_label, legend=False)


def complete_monthly_totals(df: pd.DataFrame, column: str) -> pd.Series:
    """Monthly sums, excluding months the data only partially covers."""
    series = df.set_index("date")[column]
    totals = series.resample("MS").sum(min_count=1)
    days_present = series.resample("MS").count()
    days_in_month = totals.index.days_in_month
    return totals[(days_present == days_in_month) & totals.notna()]


def monthly_precipitation(df: pd.DataFrame, units: Units) -> go.Figure:
    monthly = complete_monthly_totals(df, "precipitation_sum")
    fig = go.Figure(
        _bar(
            monthly.index,
            units.precip(monthly.values),
            "Precipitation",
            SERIES["blue"],
            hovertemplate=f"%{{x|%b %Y}}: %{{y:.1f}} {units.precip_label}<extra></extra>",
        )
    )
    fig.update_layout(hovermode="closest")
    return _layout(fig, y_title=f"{units.precip_label} per month", height=280, legend=False)
