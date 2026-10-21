import type { ForecastEntry } from '../api/client'
import { skyFor } from '../lib/sky'
import { formatTime, toLocationTime } from '../lib/time'
import type { Units } from '../lib/units'
import { WeatherIcon } from './WeatherIcon'

/** The next 24 hours in 3-hour steps: time, conditions, temperature, chance of rain. */
export function NextHours({
  entries,
  nowMs,
  offset,
  units,
}: {
  entries: readonly ForecastEntry[]
  nowMs: number
  offset: number | null
  units: Units
}) {
  const upcoming = entries.filter((e) => Date.parse(e.forecast_for) > nowMs).slice(0, 8)
  if (!upcoming.length) return null
  return (
    <section className="card next-hours" aria-label="Next 24 hours">
      <h2 className="instrument-label">Next 24 hours</h2>
      <ol>
        {upcoming.map((e) => {
          const sky = skyFor({ ...e, observed_at: e.forecast_for, sunrise: null, sunset: null })
          const pop = Math.round((e.pop ?? 0) * 100)
          return (
            <li key={e.forecast_for}>
              <time dateTime={e.forecast_for}>
                {formatTime(toLocationTime(e.forecast_for, offset))}
              </time>
              <WeatherIcon sky={sky} size={22} />
              <span className="next-hours-temp">{Math.round(units.temp(e.temp))}°</span>
              <span className="next-hours-pop" aria-label={`${pop}% chance of precipitation`}>
                {pop >= 10 ? `${pop}%` : ' '}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
