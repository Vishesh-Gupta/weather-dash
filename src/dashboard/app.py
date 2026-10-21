"""Streamlit dashboard. Run with `streamlit run src/dashboard/app.py`."""

from datetime import timedelta

import pandas as pd
import streamlit as st

from src.dashboard import charts, data
from src.dashboard.units import Units, UnitSystem, compass
from src.data_collection.collector import run_collection
from src.data_collection.openweather import OpenWeatherError
from src.database import repository
from src.database.models import Location
from src.database.session import session_scope
from src.database.setup import init_db
from src.utils.auth import LoginThrottle
from src.utils.config import get_settings
from src.utils.locations import search_location

HISTORY_PRESETS = {
    "Last 30 days": 30,
    "Last 90 days": 90,
    "Last 12 months": 365,
    "Last 5 years": 365 * 5,
    "All": None,
}
OBSERVATION_WINDOWS = {"Last 24 hours": 1, "Last 7 days": 7, "Last 30 days": 30}
# Collected data changes at most every scheduler interval, so short caching lets
# many concurrent visitors share query results.
CACHE_TTL_SECONDS = 300


@st.cache_resource
def ensure_schema() -> None:
    init_db()


def load_locations() -> list[Location]:
    with session_scope() as session:
        return repository.list_locations(session)


@st.cache_resource
def login_throttle() -> LoginThrottle:
    return LoginThrottle()


def _location_ref(location_id: int, utc_offset_seconds: int | None) -> Location:
    # Cached functions take plain values; rebuild the minimal Location the queries use.
    return Location(id=location_id, utc_offset_seconds=utc_offset_seconds)


@st.cache_data(ttl=CACHE_TTL_SECONDS, show_spinner=False)
def cached_history(location_id: int) -> pd.DataFrame:
    return data.daily_history(location_id)


@st.cache_data(ttl=CACHE_TTL_SECONDS, show_spinner=False)
def cached_forecast(location_id: int, utc_offset_seconds: int | None) -> pd.DataFrame:
    return data.latest_forecast(_location_ref(location_id, utc_offset_seconds))


@st.cache_data(ttl=CACHE_TTL_SECONDS, show_spinner=False)
def cached_observations(
    location_id: int, utc_offset_seconds: int | None, days: int
) -> pd.DataFrame:
    since = data.now_utc() - timedelta(days=days)
    return data.observations(_location_ref(location_id, utc_offset_seconds), since)


@st.cache_data(ttl=CACHE_TTL_SECONDS, show_spinner=False)
def cached_air_quality(location_id: int, utc_offset_seconds: int | None, days: int) -> pd.DataFrame:
    since = data.now_utc() - timedelta(days=days)
    return data.air_quality(_location_ref(location_id, utc_offset_seconds), since)


def clear_data_caches() -> None:
    for fn in (cached_history, cached_forecast, cached_observations, cached_air_quality):
        fn.clear()


def collect(location_ids: list[int] | None = None) -> None:
    with st.spinner("Fetching the latest weather…"):
        try:
            run = run_collection(location_ids=location_ids)
        except OpenWeatherError as exc:
            st.error(str(exc))
            return
    clear_data_caches()
    if run.status == "success":
        st.toast("Weather data updated")
    else:
        st.warning(f"Collection finished with status **{run.status}**:\n\n{run.errors}")


# --- Sidebar ---------------------------------------------------------------


def sidebar_add_location(has_api_key: bool) -> None:
    with st.sidebar.expander("Add a location", expanded=not load_locations()):
        if not has_api_key:
            st.info("Set `WEATHER_API_KEY` to search for and collect new locations.")
            return
        with st.form("location-search", border=False):
            query = st.text_input("City", placeholder="e.g. Toronto or Paris, FR")
            submitted = st.form_submit_button("Search")
        if submitted:
            try:
                st.session_state.search_results = search_location(query)
            except OpenWeatherError as exc:
                st.error(str(exc))
                st.session_state.search_results = []
            if not st.session_state.search_results:
                st.caption("No matches found.")

        results = st.session_state.get("search_results") or []
        if results:
            choice = st.radio(
                "Matches", range(len(results)), format_func=lambda i: results[i]["display_name"]
            )
            if st.button("Track location", type="primary"):
                picked = results[choice]
                with session_scope() as session:
                    location = repository.add_location(
                        session,
                        name=picked["name"],
                        state=picked["state"],
                        country=picked["country"],
                        lat=picked["lat"],
                        lon=picked["lon"],
                    )
                    location_id = location.id
                st.session_state.search_results = []
                st.session_state.selected_location_id = location_id
                collect([location_id])
                st.rerun()


def sidebar_manage_locations(locations: list[Location]) -> None:
    if not locations:
        return
    with st.sidebar.expander("Manage locations"):
        for location in locations:
            name_col, button_col = st.columns([3, 1])
            name_col.write(location.display_name)
            if button_col.button("Remove", key=f"remove-{location.id}"):
                with session_scope() as session:
                    repository.delete_location(session, location.id)
                clear_data_caches()
                st.rerun()


def _sign_in(admin_password: str) -> None:
    candidate = st.session_state.get("admin-password", "")
    result = login_throttle().attempt(candidate, admin_password)
    st.session_state.is_admin = result is True
    st.session_state.sign_in_error = {
        True: None,
        False: "Incorrect password.",
        None: "Too many failed attempts. Try again in a few minutes.",
    }[result]


def _sign_out() -> None:
    st.session_state.is_admin = False


def sidebar_admin(admin_password: str | None) -> None:
    """Sign-in for public deployments. Does nothing when no admin password is configured.

    Callbacks run before the script re-executes, so the rest of the page already
    reflects the new sign-in state when it renders.
    """
    if not admin_password:
        return
    st.sidebar.divider()
    if st.session_state.get("is_admin"):
        st.sidebar.caption("🔓 Signed in as admin")
        st.sidebar.button("Sign out", width="stretch", on_click=_sign_out)
        return

    with st.sidebar.expander("Admin sign-in"):
        with st.form("admin-sign-in", border=False, clear_on_submit=True):
            st.text_input("Password", type="password", key="admin-password")
            st.form_submit_button("Sign in", on_click=_sign_in, args=(admin_password,))
        if error := st.session_state.pop("sign_in_error", None):
            st.error(error)


def sidebar_collection_status(can_manage: bool) -> None:
    run = data.last_collection_run()
    st.sidebar.divider()
    if run:
        icon = {"success": "✅", "partial": "⚠️", "failed": "❌"}.get(run.status, "⏳")
        st.sidebar.caption(
            f"{icon} Last collection: {run.started_at:%Y-%m-%d %H:%M} UTC ({run.status})"
        )
    else:
        st.sidebar.caption("No data collected yet.")
    if can_manage and st.sidebar.button("Collect now", width="stretch"):
        collect()
        st.rerun()


# --- Main tabs ---------------------------------------------------------------


def render_now(location: Location, units: Units) -> None:
    obs = data.latest_observation(location.id)
    if obs is None:
        st.info("No observations yet. Use **Collect now** or wait for the scheduler.")
        return

    tz = data.local_tz(location)
    observed = obs.observed_at.astimezone(tz)
    description = (obs.weather_description or "").capitalize()
    st.subheader(f"{units.temp(obs.temp):.0f}{units.temp_label} · {description}")
    st.caption(f"Observed {observed:%a %d %b, %H:%M} local time")

    wind = "–"
    if obs.wind_speed is not None:
        wind = (
            f"{units.wind(obs.wind_speed):.0f} {units.wind_label} {compass(obs.wind_deg)}".strip()
        )
    visibility = "–"
    if obs.visibility is not None:
        visibility = f"{units.distance(obs.visibility):.1f} {units.distance_label}"
    tiles = [
        ("Feels like", f"{units.temp(obs.feels_like):.1f}{units.temp_label}"),
        ("Humidity", f"{obs.humidity:.0f}%" if obs.humidity is not None else "–"),
        ("Wind", wind),
        ("Pressure", f"{obs.pressure:.0f} hPa" if obs.pressure is not None else "–"),
        ("Cloud cover", f"{obs.clouds:.0f}%" if obs.clouds is not None else "–"),
        ("Visibility", visibility),
    ]
    for row in (tiles[:3], tiles[3:]):
        for col, (label, value) in zip(st.columns(3), row, strict=True):
            col.metric(label, value)
    if obs.sunrise and obs.sunset:
        st.caption(
            f"🌅 Sunrise {obs.sunrise.astimezone(tz):%H:%M} · 🌇 Sunset {obs.sunset.astimezone(tz):%H:%M}"
        )

    window = st.radio(
        "Observed temperature",
        list(OBSERVATION_WINDOWS),
        index=1,
        horizontal=True,
        key="obs-window",
    )
    days = OBSERVATION_WINDOWS[window]
    df = cached_observations(location.id, location.utc_offset_seconds, days)
    if len(df) < 2:
        st.caption("The trend appears once the scheduler has collected a few observations.")
    else:
        st.plotly_chart(charts.observed_temperature(df, units), width="stretch")


def forecast_summary(df: pd.DataFrame, units: Units) -> pd.DataFrame:
    daily = df.assign(day=df["forecast_for"].dt.date).groupby("day")
    summary = pd.DataFrame(
        {
            f"Low ({units.temp_label})": units.temp(daily["temp"].min()).round(1),
            f"High ({units.temp_label})": units.temp(daily["temp"].max()).round(1),
            "Max chance of precipitation": (daily["pop"].max() * 100)
            .round()
            .astype("Int64")
            .astype(str)
            + "%",
            f"Precipitation ({units.precip_label})": units.precip(
                daily["rain_3h"].sum() + daily["snow_3h"].sum()
            ).round(2),
            "Conditions": daily["weather_main"].agg(
                lambda s: s.mode().iat[0] if not s.mode().empty else ""
            ),
        }
    )
    summary.index = [d.strftime("%a %d %b") for d in summary.index]
    return summary


def render_forecast(location: Location, units: Units) -> None:
    df = cached_forecast(location.id, location.utc_offset_seconds)
    if df.empty:
        st.info("No forecast collected yet.")
        return
    issued = df["issued_at"].iat[0]
    st.caption(f"5-day forecast in 3-hour steps, retrieved {issued:%a %d %b %H:%M} local time")
    summary = forecast_summary(df, units)
    st.dataframe(
        summary,
        width="stretch",
        column_config={
            col: st.column_config.NumberColumn(format="%.1f")
            for col in summary.columns
            if summary[col].dtype.kind == "f"
        },
    )
    st.plotly_chart(charts.forecast_temperature(df, units), width="stretch")
    left, right = st.columns(2)
    left.markdown("**Chance of precipitation**")
    left.plotly_chart(charts.forecast_precipitation_chance(df), width="stretch")
    right.markdown("**Expected precipitation**")
    right.plotly_chart(charts.forecast_precipitation_amount(df, units), width="stretch")


def aqi_badge(aqi: int) -> str:
    label, role = data.AQI_LEVELS.get(aqi, ("Unknown", None))
    icon = {"good": "●", "warning": "▲", "serious": "▲", "critical": "■"}.get(role, "○")
    color = charts.STATUS.get(role, charts.MUTED)
    return (
        f'<span style="color:{color};font-size:1.4rem">{icon}</span> '
        f'<span style="font-size:1.4rem;font-weight:600">{label}</span> '
        f'<span style="opacity:0.7">(AQI {aqi} of 5)</span>'
    )


def render_air_quality(location: Location) -> None:
    df = cached_air_quality(location.id, location.utc_offset_seconds, 7)
    if df.empty:
        st.info("No air quality readings yet.")
        return
    latest = df.iloc[-1]
    st.markdown(aqi_badge(int(latest["aqi"])), unsafe_allow_html=True)
    st.caption(
        f"Measured {latest['observed_at']:%a %d %b, %H:%M} local time · OpenWeather 1–5 index"
    )

    left, right = st.columns(2)
    left.markdown("**Pollutant concentrations**")
    left.plotly_chart(charts.pollutant_breakdown(latest), width="stretch")
    right.markdown("**Particulates, last 7 days**")
    if len(df) < 2:
        right.caption("The trend appears once a few readings have been collected.")
    else:
        right.plotly_chart(charts.particulate_trend(df), width="stretch")


def history_stats(df: pd.DataFrame, units: Units) -> list[tuple[str, str, str | None]]:
    """(label, value, detail) tiles summarising a history window."""
    stats = []
    extremes = [
        ("Warmest day", "temp_max", "idxmax", lambda v: f"{units.temp(v):.1f}{units.temp_label}"),
        ("Coldest day", "temp_min", "idxmin", lambda v: f"{units.temp(v):.1f}{units.temp_label}"),
        (
            "Wettest day",
            "precipitation_sum",
            "idxmax",
            lambda v: f"{units.precip(v):.1f} {units.precip_label}",
        ),
    ]
    for label, column, pick, fmt in extremes:
        if df[column].notna().any():
            row = df.loc[getattr(df[column], pick)()]
            stats.append((label, fmt(row[column]), f"{row['date']:%d %b %Y}"))
    if df["precipitation_sum"].notna().any():
        total = units.precip(df["precipitation_sum"].sum())
        stats.append(("Total precipitation", f"{total:.0f} {units.precip_label}", None))
    return stats


def render_history(location: Location, units: Units) -> None:
    full = cached_history(location.id)
    if full.empty:
        st.info("Historical data is backfilled from Open-Meteo on the first collection.")
        return

    preset = st.radio(
        "Period", list(HISTORY_PRESETS), index=2, horizontal=True, key="history-period"
    )
    days = HISTORY_PRESETS[preset]
    last_day = full["date"].max()
    df = full if days is None else full[full["date"] > last_day - pd.Timedelta(days=days)]

    st.caption(
        f"Daily data from the Open-Meteo archive, {df['date'].min():%d %b %Y} to {last_day:%d %b %Y}"
    )
    stats = history_stats(df, units)
    for col, (label, value, detail) in zip(st.columns(len(stats) or 1), stats, strict=False):
        col.metric(label, value)
        if detail:
            col.caption(detail)

    st.markdown("**Daily temperature** (band shows the daily low to high)")
    st.plotly_chart(charts.history_temperature(df, units), width="stretch")
    st.markdown("**Monthly precipitation** (complete months only)")
    st.plotly_chart(charts.monthly_precipitation(df, units), width="stretch")

    with st.expander("Data table"):
        table = df.copy()
        for col in ("temp_max", "temp_min", "temp_mean"):
            table[col] = units.temp(table[col]).round(1)
        for col in ("precipitation_sum", "rain_sum"):
            table[col] = units.precip(table[col]).round(2)
        table["sunshine_hours"] = (table.pop("sunshine_duration") / 3600).round(1)
        st.dataframe(table.sort_values("date", ascending=False), hide_index=True, width="stretch")
        st.download_button(
            "Download CSV",
            table.to_csv(index=False).encode(),
            file_name=f"{location.name.lower().replace(' ', '-')}-history.csv",
            mime="text/csv",
        )


def render_empty_state(has_api_key: bool, can_manage: bool) -> None:
    st.title("🌤️ Weather Analytics Dashboard")
    st.markdown(
        "Track locations to collect current conditions, 5-day forecasts and air quality from "
        "OpenWeather, with years of daily history from the Open-Meteo archive."
    )
    if not can_manage:
        st.info("No locations have been published yet. Check back soon.")
    elif has_api_key:
        st.info("Add your first location from the sidebar to get started.")
    else:
        st.warning(
            "No `WEATHER_API_KEY` is configured. Add one to your `.env` file "
            "([get a free key](https://openweathermap.org/api)) and restart the dashboard."
        )


def main() -> None:
    st.set_page_config(page_title="Weather Analytics", page_icon="🌤️", layout="wide")
    ensure_schema()
    settings = get_settings()
    has_api_key = bool(settings.api_key)
    # Without an admin password (local use) everyone can manage; otherwise only the admin.
    can_manage = not settings.admin_password or st.session_state.get("is_admin", False)

    st.sidebar.title("🌤️ Weather Analytics")
    system = st.sidebar.radio(
        "Units",
        list(UnitSystem),
        format_func=lambda s: "Metric" if s is UnitSystem.METRIC else "Imperial",
        horizontal=True,
        key="units",
    )
    units = Units(UnitSystem(system))

    locations = load_locations()
    location = None
    if locations:
        ids = [loc.id for loc in locations]
        selected = st.session_state.get("selected_location_id")
        index = ids.index(selected) if selected in ids else 0
        location = st.sidebar.selectbox(
            "Location", locations, index=index, format_func=lambda loc: loc.display_name
        )
        st.session_state.selected_location_id = location.id

    if can_manage:
        sidebar_add_location(has_api_key)
        sidebar_manage_locations(locations)
    sidebar_collection_status(can_manage and has_api_key)
    sidebar_admin(settings.admin_password)

    if location is None:
        render_empty_state(has_api_key, can_manage)
        return

    st.title(location.display_name)
    now_tab, forecast_tab, air_tab, history_tab = st.tabs(
        ["Now", "Forecast", "Air quality", "History"]
    )
    with now_tab:
        render_now(location, units)
    with forecast_tab:
        render_forecast(location, units)
    with air_tab:
        render_air_quality(location)
    with history_tab:
        render_history(location, units)


main()
