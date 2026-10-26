import { Link } from '@tanstack/react-router'

import type { Alert, Location, Observation } from '../api/client'
import { alertLevel, sortAlerts } from '../lib/alerts'
import { STALE_READING_MS, isStale, versusNormal } from '../lib/insights'
import { sceneFor } from '../lib/scene'
import { skyStyle } from '../lib/skyStyle'
import { skyFor } from '../lib/sky'
import { formatDayTime, formatTime, toLocationTime } from '../lib/time'
import { compass, type Units } from '../lib/units'
import { relativeTime, useNow } from '../lib/useNow'
import { LiveValue } from './Instrument'
import { SunArc } from './SunArc'
import { WeatherIcon } from './WeatherIcon'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The location's wall-clock time, ticking. */
export function LocalClock({ offset }: { offset: number | null }) {
  const now = useNow(15_000)
  const iso = new Date(now).toISOString()
  return <time dateTime={iso}>{formatTime(toLocationTime(iso, offset))}</time>
}

export function UpdatedAgo({ iso }: { iso: string }) {
  const now = useNow(30_000)
  return <>{relativeTime(Date.parse(iso), now)}</>
}

interface HeroProps {
  location: Location
  obs: Observation
  units: Units
  today?: { high: number; low: number } | null
}

/** Current conditions over the page's sky, with the day's sunrise and sunset. */
export function Hero({ location, obs, units, today }: HeroProps) {
  const sky = skyFor(obs)
  const offset = location.utc_offset_seconds
  const now = useNow(60_000)
  const stale = isStale(obs.observed_at, now, STALE_READING_MS)
  const observed = toLocationTime(obs.observed_at, offset)
  return (
    <section
      className={stale ? 'hero is-stale' : 'hero'}
      aria-label={`Current weather in ${location.display_name}`}
    >
      {stale ? (
        <p className="stale-notice" role="status">
          <strong>Not updating.</strong> No new readings since {formatDayTime(observed)} local time
          ({relativeTime(Date.parse(obs.observed_at), now)}); these are the last ones collected.
        </p>
      ) : null}
      <div className="hero-now">
        <span className="hero-temp">
          <LiveValue value={`${Math.round(units.temp(obs.temp))}°`} />
        </span>
        <div className="hero-detail">
          <div className="hero-condition">
            <WeatherIcon sky={sky} size={22} />
            {obs.weather_description ? capitalize(obs.weather_description) : ''}
          </div>
          <div>
            Feels like {Math.round(units.temp(obs.feels_like))}
            {units.tempLabel}
          </div>
          {today ? (
            <div>
              H {Math.round(units.temp(today.high))}° · L {Math.round(units.temp(today.low))}°
            </div>
          ) : null}
          <div className="hero-clock">
            <LocalClock offset={offset} /> local time
          </div>
        </div>
      </div>
      <SunArc obs={obs} offset={offset} />
      <div className="hero-foot">
        Observed {stale ? formatDayTime(observed) : formatTime(observed)} · updated{' '}
        <UpdatedAgo iso={obs.observed_at} />
      </div>
    </section>
  )
}

interface CardProps {
  location: Location
  obs: Observation | null
  units: Units
  today?: { high: number; low: number } | null
  aqi?: { label: string; role: string | null } | null
  /** The climate normal for today, to say whether today runs warm or cold. */
  normalHigh?: number | null
  alerts?: readonly Alert[]
}

export function LocationCard({
  location,
  obs,
  units,
  today,
  aqi,
  normalHigh,
  alerts = [],
}: CardProps) {
  const now = useNow(60_000)
  const stale = obs ? isStale(obs.observed_at, now, STALE_READING_MS) : false
  const versus = versusNormal(today?.high, normalHigh)
  const delta = versus ? Math.round(units.temp(versus.difference) - units.temp(0)) : 0
  const scene = obs ? sceneFor(obs, location, now) : null
  return (
    <Link
      to="/locations/$locationId"
      params={{ locationId: location.id }}
      className={stale ? 'location-card is-stale' : 'location-card'}
      style={scene ? skyStyle(scene.palette) : undefined}
    >
      <div className="card-top">
        <div>
          <div className="card-place">{location.name}</div>
          <div className="card-sub">
            {[location.state, location.country].filter(Boolean).join(', ')} ·{' '}
            <LocalClock offset={location.utc_offset_seconds} />
          </div>
        </div>
        {scene ? <WeatherIcon sky={scene.sky} size={28} /> : null}
      </div>
      {obs ? (
        <>
          <div className="card-temp">
            <LiveValue value={`${Math.round(units.temp(obs.temp))}°`} />
            <span className="card-condition">
              {obs.weather_description ? capitalize(obs.weather_description) : ''}
            </span>
          </div>
          <dl className="card-stats">
            <div>
              <dt>Feels</dt>
              <dd>{Math.round(units.temp(obs.feels_like))}°</dd>
            </div>
            {obs.wind_speed != null ? (
              <div>
                <dt>Wind</dt>
                <dd>
                  {Math.round(units.wind(obs.wind_speed))} {units.windLabel} {compass(obs.wind_deg)}
                </dd>
              </div>
            ) : null}
            {obs.humidity != null ? (
              <div>
                <dt>Humidity</dt>
                <dd>{Math.round(obs.humidity)}%</dd>
              </div>
            ) : null}
          </dl>
          <div className="card-meta">
            {today && !stale ? (
              <span>
                H {Math.round(units.temp(today.high))}° · L {Math.round(units.temp(today.low))}°
              </span>
            ) : null}
            {alerts.length ? (
              <span className={`chip chip-${alertLevel(sortAlerts(alerts)[0]!.event)}`}>
                {sortAlerts(alerts)[0]!.event}
                {alerts.length > 1 ? ` +${alerts.length - 1}` : ''}
              </span>
            ) : null}
            {stale ? <span className="chip chip-warning">Not updating</span> : null}
            {versus?.notable && !stale ? (
              <span className={`chip chip-${versus.difference > 0 ? 'warm' : 'cold'}`}>
                {delta > 0 ? '+' : '−'}
                {Math.abs(delta)}° vs normal
              </span>
            ) : null}
            {aqi ? (
              <span className={`chip chip-${aqi.role ?? 'none'}`}>
                Air {aqi.label.toLowerCase()}
              </span>
            ) : null}
            <span className="card-updated">
              <UpdatedAgo iso={obs.observed_at} />
            </span>
          </div>
        </>
      ) : (
        <div className="card-empty">Collecting first data…</div>
      )}
    </Link>
  )
}
