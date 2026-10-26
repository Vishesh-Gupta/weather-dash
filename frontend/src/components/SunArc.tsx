import type { Observation } from '../api/client'
import { arcPoint, formatDuration, moonPhase, moonPhaseName, skyClock } from '../lib/astro'
import { formatTime, toLocationTime } from '../lib/time'
import { useNow } from '../lib/useNow'
import { Moon } from './Moon'

const WIDTH = 1000
const HEIGHT = 220
const INSET = 18

/** The arc from its start up to `fraction` of the way along, as an SVG path. */
function arcPath(fraction = 1): string {
  const steps = Math.max(1, Math.round(60 * fraction))
  const points = Array.from({ length: steps + 1 }, (_, i) =>
    arcPoint((i / steps) * fraction, WIDTH, HEIGHT, INSET),
  )
  return points.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
}

const PATH = arcPath()

/** Sunrise, sunset and where the sun (or moon) is now, drawn across the hero. */
export function SunArc({ obs, offset }: { obs: Observation; offset: number | null }) {
  const now = useNow(30_000)
  if (!obs.sunrise || !obs.sunset) return null
  const clock = skyClock(now, obs.sunrise, obs.sunset)
  const day = clock.period === 'day'
  const local = (ms: number) => formatTime(toLocationTime(new Date(ms).toISOString(), offset))
  const sunrise = Date.parse(obs.sunrise)
  const sunset = Date.parse(obs.sunset)
  const point = arcPoint(clock.progress, WIDTH, HEIGHT, INSET)
  const phase = moonPhase(now)
  const left = day
    ? { label: 'Sunrise', time: local(sunrise) }
    : { label: 'Sunset', time: local(sunset) }
  const right = day
    ? { label: 'Sunset', time: local(sunset) }
    : { label: 'Sunrise', time: local(clock.next.at) }
  const untilNext = formatDuration(clock.next.at - now)

  return (
    <div className={`sun-arc ${day ? 'is-day' : 'is-night'}`}>
      {/* The arc and the sun share this box so the sun always sits on the line. */}
      <div className="sun-arc-sky">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={PATH} className="sun-arc-track" vectorEffect="non-scaling-stroke" />
          <path
            d={arcPath(clock.progress)}
            className="sun-arc-progress"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className={day ? 'sun-arc-sun' : 'sun-arc-moon'}
          style={{ left: `${(point.x / WIDTH) * 100}%`, top: `${(point.y / HEIGHT) * 100}%` }}
        >
          {day ? null : <Moon phase={phase} size={20} />}
        </div>
      </div>
      <div className="sun-arc-labels">
        <div>
          <div className="sun-arc-label">{left.label}</div>
          <div className="sun-arc-time">{left.time}</div>
        </div>
        <div className="sun-arc-center">
          {day ? (
            <>
              <div>Daylight {formatDuration(clock.dayLengthMs)}</div>
              <div className="sun-arc-sub">Sunset in {untilNext}</div>
            </>
          ) : (
            <>
              <div>{moonPhaseName(phase)}</div>
              <div className="sun-arc-sub">Sunrise in {untilNext}</div>
            </>
          )}
        </div>
        <div className="sun-arc-end">
          <div className="sun-arc-label">{right.label}</div>
          <div className="sun-arc-time">{right.time}</div>
        </div>
      </div>
    </div>
  )
}
