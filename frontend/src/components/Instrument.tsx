import { useState, type ReactNode } from 'react'

/**
 * A reading that briefly highlights when a live update changes it. Uses React's
 * "adjust state while rendering" pattern, so the first render never flashes.
 */
export function LiveValue({ value, children }: { value: string; children?: ReactNode }) {
  const [previous, setPrevious] = useState(value)
  const [changes, setChanges] = useState(0)
  if (value !== previous) {
    setPrevious(value)
    setChanges((n) => n + 1)
  }
  return (
    <span key={changes} className={changes ? 'live-changed' : undefined}>
      {children ?? value}
    </span>
  )
}

/** A small trend line; decorative, since the values are given in text beside it. */
export function Sparkline({ values }: { values: readonly (number | null | undefined)[] }) {
  const points = values
    .map((v, i) => (v == null ? null : ([i, v] as const)))
    .filter((p): p is readonly [number, number] => p !== null)
  if (points.length < 2) return null
  const ys = points.map(([, v]) => v)
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  const span = hi - lo || 1
  const last = values.length - 1 || 1
  const x = (i: number) => (i / last) * 100
  // Flat series sit in the middle; otherwise use most of the height.
  const y = (v: number) => (hi === lo ? 14 : 25 - ((v - lo) / span) * 22)
  const line = points.map(([i, v], n) => `${n ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
  const [endX, endY] = points.at(-1)!
  return (
    <div className="sparkline" aria-hidden="true">
      <svg viewBox="0 0 100 28" preserveAspectRatio="none">
        <path
          className="sparkline-area"
          d={`${line.join(' ')} L${x(endX)} 28 L${x(points[0]![0])} 28 Z`}
        />
        <path className="sparkline-line" d={line.join(' ')} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Outside the stretched SVG so the latest point stays round. */}
      <span
        className="sparkline-end"
        style={{ left: `${x(endX)}%`, top: `${(y(endY) / 28) * 100}%` }}
      />
    </div>
  )
}

/** A thin bar for a 0–1 share, such as humidity or chance of rain. */
export function Meter({ value, label }: { value: number; label: string }) {
  const clamped = Math.min(1, Math.max(0, value))
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <div className="meter-fill" style={{ width: `${clamped * 100}%` }} />
    </div>
  )
}

/**
 * Where the wind comes from, like a weather vane: the arrow points the way the
 * wind blows and turns smoothly when it changes.
 */
export function WindDial({ degrees, size = 46 }: { degrees: number; size?: number }) {
  return (
    <svg className="wind-dial" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" className="wind-dial-ring" />
      {[0, 90, 180, 270].map((a) => (
        <line
          key={a}
          x1="24"
          y1="4"
          x2="24"
          y2={a === 0 ? 9 : 7}
          className={a === 0 ? 'wind-dial-north' : 'wind-dial-tick'}
          transform={`rotate(${a} 24 24)`}
        />
      ))}
      <g className="wind-dial-arrow" style={{ transform: `rotate(${degrees + 180}deg)` }}>
        <line x1="24" y1="35" x2="24" y2="14" />
        <path d="M24 11 L19.5 18 L28.5 18 Z" />
      </g>
    </svg>
  )
}

interface InstrumentProps {
  label: string
  value: string
  /** Shown after the value in a smaller size, such as a unit. */
  unit?: string
  detail?: ReactNode
  /** A dial or other visual beside the value. */
  aside?: ReactNode
  /** A sparkline or meter along the bottom. */
  children?: ReactNode
}

/** One reading: what it is, its value, what it means, and how it is moving. */
export function Instrument({ label, value, unit, detail, aside, children }: InstrumentProps) {
  return (
    <section className="instrument" aria-label={label}>
      <h3 className="instrument-label">{label}</h3>
      <div className="instrument-body">
        <div className="instrument-reading">
          <div className="instrument-value">
            <LiveValue value={value} />
            {unit ? <span className="instrument-unit">{unit}</span> : null}
          </div>
          {detail ? <div className="instrument-detail">{detail}</div> : null}
        </div>
        {aside}
      </div>
      {children ? <div className="instrument-visual">{children}</div> : null}
    </section>
  )
}
