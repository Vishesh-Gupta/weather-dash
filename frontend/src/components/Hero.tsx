import { Link } from '@tanstack/react-router'

import type { Location, Observation } from '../api/client'
import { sceneFor } from '../lib/scene'
import { skyStyle } from '../lib/skyStyle'
import { skyFor } from '../lib/sky'
import { formatTime, toLocationTime } from '../lib/time'
import type { Units } from '../lib/units'
import { relativeTime, useNow } from '../lib/useNow'
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
  return (
    <section className="hero" aria-label={`Current weather in ${location.display_name}`}>
      <div className="hero-now">
        <span className="hero-temp">{Math.round(units.temp(obs.temp))}°</span>
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
        Observed {formatTime(toLocationTime(obs.observed_at, offset))} · updated{' '}
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
}

export function LocationCard({ location, obs, units, today, aqi }: CardProps) {
  const now = useNow(60_000)
  const scene = obs ? sceneFor(obs, location, now) : null
  return (
    <Link
      to="/locations/$locationId"
      params={{ locationId: location.id }}
      className="location-card"
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
            {Math.round(units.temp(obs.temp))}°
            <span className="card-condition">
              {obs.weather_description ? capitalize(obs.weather_description) : ''}
            </span>
          </div>
          <div className="card-meta">
            {today ? (
              <span>
                H {Math.round(units.temp(today.high))}° · L {Math.round(units.temp(today.low))}°
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
