import { Link } from '@tanstack/react-router'

import type { Location, Observation } from '../api/client'
import { daylightProgress, skyFor, themeFor } from '../lib/sky'
import { formatTime, toLocationTime } from '../lib/time'
import type { Units } from '../lib/units'
import { relativeTime, useNow } from '../lib/useNow'
import { WeatherIcon } from './WeatherIcon'

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The location's wall-clock time, ticking. */
export function LocalClock({ offset }: { offset: number | null }) {
  const now = useNow(15_000)
  return (
    <time dateTime={new Date(now).toISOString()}>
      {formatTime(toLocationTime(new Date(now).toISOString(), offset))}
    </time>
  )
}

export function UpdatedAgo({ iso }: { iso: string }) {
  const now = useNow(30_000)
  return <>{relativeTime(Date.parse(iso), now)}</>
}

function SunBar({ obs, offset }: { obs: Observation; offset: number | null }) {
  const now = useNow(60_000)
  if (!obs.sunrise || !obs.sunset) return null
  const progress = daylightProgress(now, obs.sunrise, obs.sunset)
  const sunrise = formatTime(toLocationTime(obs.sunrise, offset))
  const sunset = formatTime(toLocationTime(obs.sunset, offset))
  return (
    <div className="sunbar">
      <span>Sunrise {sunrise}</span>
      <div
        className="sunbar-track"
        role="meter"
        aria-label="Daylight elapsed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress == null ? 0 : Math.round(progress * 100)}
        aria-valuetext={
          progress == null ? 'After sunset' : `${Math.round(progress * 100)}% of daylight elapsed`
        }
      >
        {progress != null ? (
          <span className="sunbar-sun" style={{ left: `${progress * 100}%` }} />
        ) : null}
      </div>
      <span>Sunset {sunset}</span>
    </div>
  )
}

interface HeroProps {
  location: Location
  obs: Observation
  units: Units
  today?: { high: number; low: number } | null
}

export function Hero({ location, obs, units, today }: HeroProps) {
  const sky = skyFor(obs)
  const offset = location.utc_offset_seconds
  return (
    <section
      className={`hero sky-${themeFor(sky)}`}
      aria-label={`Current weather in ${location.display_name}`}
    >
      <div className="hero-top">
        <div>
          <div className="hero-place">{location.name}</div>
          <div className="hero-clock">
            <LocalClock offset={offset} /> local time
          </div>
        </div>
        <WeatherIcon sky={sky} size={104} />
      </div>
      <div className="hero-main">
        <span className="hero-temp">{Math.round(units.temp(obs.temp))}°</span>
        <div className="hero-detail">
          <div className="hero-condition">
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
        </div>
      </div>
      <SunBar obs={obs} offset={offset} />
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
  const sky = obs ? skyFor(obs) : null
  return (
    <Link
      to="/locations/$locationId"
      params={{ locationId: location.id }}
      className={`location-card sky-${sky ? themeFor(sky) : 'clouds-day'}`}
    >
      <div className="card-top">
        <div>
          <div className="card-place">{location.name}</div>
          <div className="card-sub">
            {[location.state, location.country].filter(Boolean).join(', ')} ·{' '}
            <LocalClock offset={location.utc_offset_seconds} />
          </div>
        </div>
        {sky ? <WeatherIcon sky={sky} size={56} /> : null}
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
