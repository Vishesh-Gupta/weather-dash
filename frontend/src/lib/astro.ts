// Sun and moon geometry for the sky: where along its arc the sun (or moon) is,
// how long the day is, and today's moon phase.

const SYNODIC_MONTH_DAYS = 29.530588853
// A well-documented new moon: 2000-01-06 18:14 UTC.
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14)
const DAY_MS = 86_400_000

/** Moon phase in [0, 1): 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(nowMs: number): number {
  const days = (nowMs - REFERENCE_NEW_MOON_MS) / DAY_MS
  const phase = (days / SYNODIC_MONTH_DAYS) % 1
  return phase < 0 ? phase + 1 : phase
}

export function moonPhaseName(phase: number): string {
  const names = [
    'New moon',
    'Waxing crescent',
    'First quarter',
    'Waxing gibbous',
    'Full moon',
    'Waning gibbous',
    'Last quarter',
    'Waning crescent',
  ]
  return names[Math.round(phase * 8) % 8]!
}

/**
 * SVG path for the lit part of a moon of radius r centred at (cx, cy).
 * Northern-hemisphere view: waxing moons are lit on the right.
 */
export function moonLitPath(phase: number, cx: number, cy: number, r: number): string {
  const waxing = phase <= 0.5
  // Terminator ellipse half-width: r at new/full, 0 at the quarters.
  const terminator = Math.abs(Math.cos(2 * Math.PI * phase)) * r
  const top = `${cx} ${cy - r}`
  const bottom = `${cx} ${cy + r}`
  const outerSweep = waxing ? 1 : 0
  // The terminator bulges towards the dark side before full, towards the lit side after.
  const gibbous = Math.abs(phase - 0.5) < 0.25
  const innerSweep = waxing === gibbous ? 1 : 0
  return `M ${top} A ${r} ${r} 0 0 ${outerSweep} ${bottom} A ${terminator} ${r} 0 0 ${innerSweep} ${top} Z`
}

export interface SkyClock {
  /** 'day' between sunrise and sunset, otherwise 'night'. */
  period: 'day' | 'night'
  /** Progress through the current period, 0–1. */
  progress: number
  /** The next sunrise or sunset. */
  next: { kind: 'sunrise' | 'sunset'; at: number }
  dayLengthMs: number
}

/**
 * Where we are between sunrise and sunset. OpenWeather gives today's times; the
 * night arc runs from sunset to the next sunrise (≈ sunrise + 24 h).
 */
export function skyClock(nowMs: number, sunriseIso: string, sunsetIso: string): SkyClock {
  let sunrise = Date.parse(sunriseIso)
  let sunset = Date.parse(sunsetIso)
  const dayLengthMs = sunset - sunrise
  // Shift today's times to the day containing `now`.
  while (nowMs >= sunrise + DAY_MS) {
    sunrise += DAY_MS
    sunset += DAY_MS
  }
  while (nowMs < sunrise - (DAY_MS - dayLengthMs)) {
    sunrise -= DAY_MS
    sunset -= DAY_MS
  }
  if (nowMs >= sunrise && nowMs < sunset) {
    return {
      period: 'day',
      progress: (nowMs - sunrise) / dayLengthMs,
      next: { kind: 'sunset', at: sunset },
      dayLengthMs,
    }
  }
  const nightStart = nowMs >= sunset ? sunset : sunset - DAY_MS
  const nightEnd = nowMs >= sunset ? sunrise + DAY_MS : sunrise
  return {
    period: 'night',
    progress: (nowMs - nightStart) / (nightEnd - nightStart),
    next: { kind: 'sunrise', at: nightEnd },
    dayLengthMs,
  }
}

/** A point on a semi-elliptical arc for progress 0 (left) … 1 (right). */
export function arcPoint(progress: number, width: number, height: number, inset = 0) {
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, progress)))
  const rx = width / 2 - inset
  return { x: width / 2 + rx * Math.cos(angle), y: height - (height - inset) * Math.sin(angle) }
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours ? `${hours} h ${String(minutes).padStart(2, '0')} min` : `${minutes} min`
}
