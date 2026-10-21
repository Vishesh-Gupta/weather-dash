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

/** Background theme for a sky; partly cloudy skies use the clear backgrounds. */
export type SkyTheme =
  'clear-day' | 'clear-night' | 'clouds-day' | 'clouds-night' | 'rain' | 'thunder' | 'snow' | 'mist'

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

export function themeFor(sky: Sky): SkyTheme {
  switch (sky) {
    case 'partly-day':
      return 'clear-day'
    case 'partly-night':
      return 'clear-night'
    case 'drizzle':
      return 'rain'
    default:
      return sky
  }
}

/** Fraction of daylight elapsed (0 at sunrise, 1 at sunset), or null outside daylight. */
export function daylightProgress(
  nowMs: number,
  sunrise: string | null,
  sunset: string | null,
): number | null {
  if (!sunrise || !sunset) return null
  const start = Date.parse(sunrise)
  const end = Date.parse(sunset)
  if (nowMs < start || nowMs > end || end <= start) return null
  return (nowMs - start) / (end - start)
}
