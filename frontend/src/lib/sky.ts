// Map OpenWeather conditions to a sky scene for the hero card and icons.
// Icon codes end in "d" or "n" for day/night; https://openweathermap.org/weather-conditions

import type { Observation } from '../api/client'

export type Sky =
  | 'clear-day'
  | 'clear-night'
  | 'partly-day'
  | 'partly-night'
  | 'clouds-day'
  | 'clouds-night'
  | 'drizzle'
  | 'rain'
  | 'thunder'
  | 'snow'
  | 'mist'

type Conditions = Pick<
  Observation,
  'weather_main' | 'weather_icon' | 'clouds' | 'observed_at' | 'sunrise' | 'sunset'
>

export function isDaytime(obs: Conditions): boolean {
  const suffix = obs.weather_icon?.slice(-1)
  if (suffix === 'd') return true
  if (suffix === 'n') return false
  if (obs.sunrise && obs.sunset) {
    const t = Date.parse(obs.observed_at)
    return t >= Date.parse(obs.sunrise) && t < Date.parse(obs.sunset)
  }
  return true
}

const ATMOSPHERE = new Set([
  'Mist',
  'Smoke',
  'Haze',
  'Dust',
  'Fog',
  'Sand',
  'Ash',
  'Squall',
  'Tornado',
])

export function skyFor(obs: Conditions): Sky {
  const day = isDaytime(obs)
  const main = obs.weather_main ?? ''
  if (main === 'Thunderstorm') return 'thunder'
  if (main === 'Drizzle') return 'drizzle'
  if (main === 'Rain') return 'rain'
  if (main === 'Snow') return 'snow'
  if (ATMOSPHERE.has(main)) return 'mist'
  if (main === 'Clouds') {
    // 02 = few clouds, 03 = scattered; 04 = broken/overcast.
    const code = obs.weather_icon?.slice(0, 2)
    const partly = code ? code === '02' || code === '03' : (obs.clouds ?? 100) < 60
    if (partly) return day ? 'partly-day' : 'partly-night'
    return day ? 'clouds-day' : 'clouds-night'
  }
  return day ? 'clear-day' : 'clear-night'
}

/**
 * Sky for a WMO weather code, as Open-Meteo reports them.
 * https://open-meteo.com/en/docs#weather_variable_documentation
 */
export function skyForCode(
  code: number | null | undefined,
  isDay: boolean | null | undefined,
): Sky {
  const day = isDay ?? true
  if (code == null || code === 0) return day ? 'clear-day' : 'clear-night'
  if (code <= 2) return day ? 'partly-day' : 'partly-night'
  if (code === 3) return day ? 'clouds-day' : 'clouds-night'
  if (code === 45 || code === 48) return 'mist'
  if (code >= 51 && code <= 57) return 'drizzle'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 95) return 'thunder'
  return 'rain'
}

const CODE_LABELS: [number, string][] = [
  [0, 'Clear'],
  [1, 'Mainly clear'],
  [2, 'Partly cloudy'],
  [3, 'Overcast'],
  [48, 'Fog'],
  [57, 'Drizzle'],
  [61, 'Light rain'],
  [63, 'Rain'],
  [65, 'Heavy rain'],
  [67, 'Freezing rain'],
  [77, 'Snow'],
  [80, 'Light showers'],
  [81, 'Showers'],
  [82, 'Heavy showers'],
  [86, 'Snow showers'],
  [99, 'Thunderstorm'],
]

/** A short description of a WMO weather code. */
export function codeLabel(code: number | null | undefined): string {
  if (code == null) return 'Unknown'
  return CODE_LABELS.find(([max]) => code <= max)?.[1] ?? 'Unknown'
}
