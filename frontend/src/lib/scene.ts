// Everything the animated sky needs, derived from one observation: background
// theme, precipitation and cloud intensity, fog, wind drift and sun/moon position.

import type { Observation } from '../api/client'
import { moonIllumination, moonPhase, skyClock, type SkyClock } from './astro'
import { skyFor, themeFor, type Sky, type SkyTheme } from './sky'

export interface WeatherScene {
  sky: Sky
  theme: SkyTheme
  /** 0 (none) to 1 (heavy). */
  rain: number
  snow: number
  clouds: number
  fog: number
  thunder: boolean
  stars: boolean
  /** Horizontal drift of falling particles, -1 (leftwards) to 1 (rightwards). */
  wind: number
  clock: SkyClock | null
  moon: { phase: number; illumination: number }
}

// Dawn and dusk colors last this long either side of sunrise and sunset.
const TWILIGHT_MS = 50 * 60_000

const clamp = (value: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value))

/** Map an hourly amount (mm/h) onto 0–1: ≈0.5 mm/h light, 4 mm/h moderate, 10+ heavy. */
const intensity = (mmPerHour: number) => clamp(0.15 + Math.log10(1 + mmPerHour) * 0.85)

export function sceneFor(obs: Observation, nowMs: number): WeatherScene {
  const sky = skyFor(obs)
  let theme = themeFor(sky)
  const clock = obs.sunrise && obs.sunset ? skyClock(nowMs, obs.sunrise, obs.sunset) : null

  if (clock && (theme === 'clear-day' || theme === 'clear-night')) {
    const toNext = clock.next.at - nowMs
    const fromLast = clock.period === 'day' ? clock.progress * clock.dayLengthMs : null
    if (clock.next.kind === 'sunrise' && toNext < TWILIGHT_MS) theme = 'dawn'
    else if (clock.next.kind === 'sunset' && toNext < TWILIGHT_MS) theme = 'dusk'
    else if (fromLast !== null && fromLast < TWILIGHT_MS) theme = 'dawn'
  }

  const main = obs.weather_main ?? ''
  let rain = 0
  if (sky === 'drizzle') rain = 0.2
  if (sky === 'rain' || sky === 'thunder')
    rain = obs.rain_1h ? intensity(obs.rain_1h) : sky === 'thunder' ? 0.75 : 0.5
  const snow = sky === 'snow' ? (obs.snow_1h ? intensity(obs.snow_1h) : 0.5) : 0

  let fog = 0
  if (sky === 'mist') {
    const visibility = obs.visibility ?? 5000
    fog = clamp(1 - visibility / 10000, main === 'Fog' ? 0.5 : 0.3, 1)
  }

  // Meteorological direction is where wind comes FROM; particles travel the other way.
  const toward = obs.wind_deg == null ? 0 : -Math.sin((obs.wind_deg * Math.PI) / 180)
  const wind = clamp(toward * clamp((obs.wind_speed ?? 0) / 15), -1, 1)

  const clouds = clamp((obs.clouds ?? 0) / 100)
  const night = clock ? clock.period === 'night' : sky.endsWith('night')
  const phase = moonPhase(nowMs)

  return {
    sky,
    theme,
    rain,
    snow,
    clouds,
    fog,
    thunder: sky === 'thunder',
    stars: night && clouds < 0.7 && rain === 0 && snow === 0 && fog < 0.5,
    wind,
    clock,
    moon: { phase, illumination: moonIllumination(phase) },
  }
}
