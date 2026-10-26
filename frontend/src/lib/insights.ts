// What the readings mean: raw values turned into the words and comparisons people
// use, each from a standard definition.

import type { ForecastEntry, HourlyEntry, NowcastEntry, Observation } from '../api/client'

/** Beaufort scale: upper bound of each force in m/s, and its name. */
const BEAUFORT: readonly [number, string][] = [
  [0.5, 'Calm'],
  [1.5, 'Light air'],
  [3.3, 'Light breeze'],
  [5.5, 'Gentle breeze'],
  [7.9, 'Moderate breeze'],
  [10.7, 'Fresh breeze'],
  [13.8, 'Strong breeze'],
  [17.1, 'Near gale'],
  [20.7, 'Gale'],
  [24.4, 'Strong gale'],
  [28.4, 'Storm'],
  [32.6, 'Violent storm'],
]

export function beaufort(metersPerSecond: number): { force: number; label: string } {
  const index = BEAUFORT.findIndex(([upper]) => metersPerSecond < upper)
  return index === -1
    ? { force: 12, label: 'Hurricane force' }
    : { force: index, label: BEAUFORT[index]![1] }
}

/** Dew point in °C from temperature (°C) and relative humidity (%), by the Magnus formula. */
export function dewPoint(celsius: number, humidity: number): number {
  const a = 17.62
  const b = 243.12
  const gamma = Math.log(Math.max(humidity, 1) / 100) + (a * celsius) / (b + celsius)
  return (b * gamma) / (a - gamma)
}

/**
 * How humid the air feels. In warm air the dew point sets comfort; in cool air
 * (below 15 °C) relative humidity is what you notice: damp and raw when high.
 */
export function humidityFeel(dewPointCelsius: number, celsius: number, humidity: number): string {
  if (celsius < 15) {
    if (humidity >= 85) return 'Damp'
    if (humidity >= 70) return 'Humid'
    if (humidity <= 30) return 'Dry'
    return 'Comfortable'
  }
  if (dewPointCelsius < 10) return 'Dry'
  if (dewPointCelsius < 16) return 'Comfortable'
  if (dewPointCelsius < 18) return 'A little humid'
  if (dewPointCelsius < 21) return 'Humid'
  if (dewPointCelsius < 24) return 'Muggy'
  return 'Oppressive'
}

export interface PressureTrend {
  /** Change over about three hours, in hPa. */
  change: number
  label: 'Rising quickly' | 'Rising' | 'Steady' | 'Falling' | 'Falling quickly'
}

const HOUR_MS = 3_600_000

/**
 * Pressure tendency over the last three hours, the interval meteorologists use: a
 * fall of more than about 3.5 hPa signals approaching unsettled weather.
 */
export function pressureTrend(readings: readonly Observation[]): PressureTrend | null {
  const withPressure = readings.filter((r) => r.pressure != null)
  const latest = withPressure.at(-1)
  if (!latest) return null
  const target = Date.parse(latest.observed_at) - 3 * HOUR_MS
  let earlier: Observation | null = null
  for (const r of withPressure) {
    const gap = Math.abs(Date.parse(r.observed_at) - target)
    if (
      gap <= 1.5 * HOUR_MS &&
      (!earlier || gap < Math.abs(Date.parse(earlier.observed_at) - target))
    ) {
      earlier = r
    }
  }
  if (!earlier) return null
  const change = latest.pressure! - earlier.pressure!
  const label =
    change >= 3.5
      ? 'Rising quickly'
      : change >= 1
        ? 'Rising'
        : change <= -3.5
          ? 'Falling quickly'
          : change <= -1
            ? 'Falling'
            : 'Steady'
  return { change, label }
}

/** Cloud cover in words, following the oktas bands used in weather reports. */
export function cloudLabel(percent: number): string {
  if (percent < 7) return 'Clear'
  if (percent < 32) return 'Mostly clear'
  if (percent < 57) return 'Partly cloudy'
  if (percent < 94) return 'Mostly cloudy'
  return 'Overcast'
}

/** Visibility in words (OpenWeather reports up to 10 km). */
export function visibilityLabel(meters: number): string {
  if (meters < 1000) return 'Fog'
  if (meters < 2000) return 'Poor'
  if (meters < 5000) return 'Moderate'
  if (meters < 10000) return 'Good'
  return 'Excellent'
}

export interface Ahead {
  /** Highest chance of precipitation in the window, 0–1. */
  chance: number
  /** When it is most likely, or null when the window looks dry. */
  at: string | null
  kind: 'rain' | 'snow' | null
  /** Expected total over the window, in mm. */
  amount: number
}

/** Rain or snow in the next few hours, from the 3-hourly forecast. */
export function precipitationAhead(
  entries: readonly ForecastEntry[],
  nowMs: number,
  hours = 6,
): Ahead | null {
  const window = entries.filter((e) => {
    const t = Date.parse(e.forecast_for)
    // A 3-hour slot that started up to 3 hours ago still covers now.
    return t > nowMs - 3 * HOUR_MS && t <= nowMs + hours * HOUR_MS
  })
  if (!window.length) return null
  const likeliest = window.reduce((best, e) => ((e.pop ?? 0) > (best.pop ?? 0) ? e : best))
  const chance = likeliest.pop ?? 0
  const amount = window.reduce((sum, e) => sum + (e.rain_3h ?? 0) + (e.snow_3h ?? 0), 0)
  const snowy = window.some((e) => (e.snow_3h ?? 0) > 0) || likeliest.weather_main === 'Snow'
  const wet = chance >= 0.2 || amount >= 0.2
  return {
    chance,
    // A slot that already began reads as "now", not a time in the past.
    at: wet ? new Date(Math.max(Date.parse(likeliest.forecast_for), nowMs)).toISOString() : null,
    kind: wet ? (snowy ? 'snow' : 'rain') : null,
    amount,
  }
}

/** Difference from normal in °C, and whether it counts as notable (≥ 1 °C). */
export function versusNormal(
  value: number | null | undefined,
  normal: number | null | undefined,
): { difference: number; notable: boolean } | null {
  if (value == null || normal == null) return null
  const difference = value - normal
  return { difference, notable: Math.abs(difference) >= 1 }
}

/** Readings older than this mean collection is delayed or has stopped. */
export const STALE_READING_MS = 3 * HOUR_MS
/** A forecast issued longer ago than this is no longer a forecast worth showing. */
export const STALE_FORECAST_MS = 24 * HOUR_MS
export const STALE_HOURLY_MS = 6 * HOUR_MS
/** The nowcast covers only two hours, so it must be recent to say anything. */
export const STALE_NOWCAST_MS = HOUR_MS

/** Whether a timestamp is too old to present as current, given the time now. */
export const isStale = (iso: string | null | undefined, nowMs: number, limitMs: number) =>
  iso != null && nowMs - Date.parse(iso) > limitMs

/** UV index category on the WHO scale, with what to do about it. */
export function uvLevel(uv: number): {
  label: string
  advice: string
  role: 'good' | 'warning' | 'serious' | 'critical'
} {
  // The WHO categories apply to the rounded index.
  const index = Math.round(uv)
  if (index <= 2) return { label: 'Low', advice: 'No protection needed', role: 'good' }
  if (index <= 5) return { label: 'Moderate', advice: 'Sunscreen at midday', role: 'warning' }
  if (index <= 7)
    return { label: 'High', advice: 'Cover up, seek shade at midday', role: 'serious' }
  if (index <= 10) return { label: 'Very high', advice: 'Avoid the midday sun', role: 'critical' }
  return { label: 'Extreme', advice: 'Stay out of the midday sun', role: 'critical' }
}

export interface UvOutlook {
  /** The index for the current hour. */
  now: number
  /**
   * The highest index still to come today (local time), when it is higher than now;
   * once the sun is down, tomorrow's. Null while it is falling from today's peak.
   */
  peak: { uv: number; at: string; tomorrow: boolean } | null
}

/** UV now and the peak to come, from the hourly forecast. */
export function uvOutlook(
  hours: readonly HourlyEntry[],
  nowMs: number,
  offsetSeconds: number | null,
): UvOutlook | null {
  const current = hours.find((h) => {
    const t = Date.parse(h.forecast_for)
    return t <= nowMs && nowMs < t + HOUR_MS
  })
  if (current?.uv_index == null) return null
  const now = current.uv_index
  const localDay = (iso: string) =>
    Math.floor((Date.parse(iso) + (offsetSeconds ?? 0) * 1000) / (24 * HOUR_MS))
  const today = localDay(current.forecast_for)
  const highest = (day: number) =>
    hours
      .filter(
        (h) =>
          localDay(h.forecast_for) === day &&
          Date.parse(h.forecast_for) >= Date.parse(current.forecast_for),
      )
      .reduce<HourlyEntry | null>(
        (best, h) => ((h.uv_index ?? 0) > (best?.uv_index ?? 0) ? h : best),
        null,
      )
  const later = highest(today)
  if (later && later.uv_index! > now)
    return { now, peak: { uv: later.uv_index!, at: later.forecast_for, tomorrow: false } }
  if (now >= 1) return { now, peak: null }
  const tomorrow = highest(today + 1)
  return {
    now,
    peak: tomorrow ? { uv: tomorrow.uv_index!, at: tomorrow.forecast_for, tomorrow: true } : null,
  }
}

const QUARTER_MS = 15 * 60_000
/** Less than this (mm per 15 minutes) counts as dry: a trace, not rain. */
const WET_MM = 0.05

export type NextRain =
  | { state: 'dry' }
  | { state: 'starting'; at: string; kind: 'rain' | 'snow' }
  | { state: 'ongoing'; until: string | null; kind: 'rain' | 'snow' }

export interface NextHourRain {
  summary: NextRain
  /** Each 15-minute slot from now: its start and rate in mm/h. */
  slots: { at: string; rate: number }[]
}

/** Rain or snow over the next two hours from the 15-minute nowcast. */
export function nextHourRain(nowcast: readonly NowcastEntry[], nowMs: number): NextHourRain | null {
  const upcoming = nowcast.filter((q) => Date.parse(q.forecast_for) + QUARTER_MS > nowMs)
  // A nowcast that no longer covers the next hour says nothing useful.
  if (upcoming.length < 4) return null
  const wet = (q: NowcastEntry) => (q.precipitation ?? 0) >= WET_MM
  const kindOf = (q: NowcastEntry): 'rain' | 'snow' => ((q.snowfall ?? 0) > 0 ? 'snow' : 'rain')
  const slots = upcoming.map((q) => ({ at: q.forecast_for, rate: (q.precipitation ?? 0) * 4 }))
  const first = upcoming[0]!
  if (wet(first)) {
    const stop = upcoming.find((q) => !wet(q))
    return {
      slots,
      summary: { state: 'ongoing', until: stop?.forecast_for ?? null, kind: kindOf(first) },
    }
  }
  const start = upcoming.find(wet)
  if (!start) return { slots, summary: { state: 'dry' } }
  return { slots, summary: { state: 'starting', at: start.forecast_for, kind: kindOf(start) } }
}
