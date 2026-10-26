import type { CSSProperties } from 'react'

import type { Slot } from '../lib/slots'
import { formatDayName, formatTime, toLocationTime } from '../lib/time'
import type { Units } from '../lib/units'
import { WeatherIcon } from './WeatherIcon'

const COLUMN = 60
const CURVE_HEIGHT = 34

/** A smooth line through each column's temperature, drawn behind the strip. */
function TemperatureCurve({ temps }: { temps: number[] }) {
  if (temps.length < 2) return null
  const lo = Math.min(...temps)
  const span = Math.max(...temps) - lo || 1
  const y = (t: number) => 6 + (1 - (t - lo) / span) * (CURVE_HEIGHT - 12)
  const points = temps.map((t, i) => [i * COLUMN + COLUMN / 2, y(t)] as const)
  // Catmull-Rom through the points, as cubic Béziers.
  const path = points
    .map(([x, py], i) => {
      if (i === 0) return `M${x} ${py.toFixed(1)}`
      const [x0, y0] = points[i - 2] ?? points[i - 1]!
      const [x1, y1] = points[i - 1]!
      const [x3, y3] = points[i + 1] ?? [x, py]
      const c1 = [x1 + (x - x0) / 6, y1 + (py - y0) / 6]
      const c2 = [x - (x3 - x1) / 6, py - (y3 - y1) / 6]
      return `C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${x} ${py.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg
      className="next-hours-curve"
      width={temps.length * COLUMN}
      height={CURVE_HEIGHT}
      aria-hidden="true"
    >
      <path d={path} />
      {points.map(([x, py], i) => (
        <circle key={i} cx={x} cy={py} r={2} />
      ))}
    </svg>
  )
}

/** The coming hours: time, conditions, temperature and chance of rain or snow. */
export function NextHours({
  slots,
  title,
  source,
  nowMs,
  offset,
  units,
}: {
  slots: readonly Slot[]
  title: string
  /** Where the forecast comes from, shown beside the title. */
  source?: string
  nowMs: number
  offset: number | null
  units: Units
}) {
  if (!slots.length) return null
  const hourly = slots.length > 8
  return (
    <section className="card next-hours" aria-label={title}>
      <div className="next-hours-head">
        <h2 className="instrument-label">{title}</h2>
        {source ? <span className="next-hours-source">{source}</span> : null}
      </div>
      <div
        className={hourly ? 'next-hours-scroll is-hourly' : 'next-hours-scroll'}
        // Scrollable regions must be reachable from the keyboard.
        tabIndex={hourly ? 0 : undefined}
        role={hourly ? 'group' : undefined}
        aria-label={hourly ? `${title}, scrolls sideways` : undefined}
        style={{ '--columns': slots.length } as CSSProperties}
      >
        {hourly ? <TemperatureCurve temps={slots.map((s) => units.temp(s.temp))} /> : null}
        <ol>
          {slots.map((slot, i) => {
            const pop = Math.round((slot.pop ?? 0) * 100)
            const local = toLocationTime(slot.at, offset)
            const current = hourly && Date.parse(slot.at) <= nowMs
            const midnight = hourly && i > 0 && local.getUTCHours() === 0
            return (
              <li key={slot.at} className={midnight ? 'is-new-day' : undefined}>
                <time dateTime={slot.at}>
                  {current ? 'Now' : midnight ? formatDayName(local) : formatTime(local)}
                </time>
                <WeatherIcon sky={slot.sky} size={22} />
                <span className="next-hours-temp">{Math.round(units.temp(slot.temp))}°</span>
                <span className="next-hours-pop">
                  <span aria-hidden="true">{pop >= 10 ? `${pop}%` : ' '}</span>
                  <span className="visually-hidden">{pop}% chance of precipitation</span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
