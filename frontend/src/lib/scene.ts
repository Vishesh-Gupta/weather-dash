// Everything the sky needs, derived from one observation and the location's
// coordinates: precipitation, cloud and fog, wind, and where the sun and moon are.

import type { Observation } from '../api/client'
import { overcastFor, skyLight, skyPalette, type SkyLight, type SkyPalette } from './atmosphere'
import { skyFor, type Sky } from './sky'
import { moonState, sunPosition, type MoonState, type SkyPosition } from './solar'

export interface Coordinates {
  lat: number
  lon: number
}

export interface WeatherScene {
  /** Condition category, for icons and wording. */
  sky: Sky
  /** 0 (none) to 1 (heavy). */
  rain: number
  snow: number
  clouds: number
  fog: number
  /** How far the weather greys out the sky, 0–1. */
  overcast: number
  thunder: boolean
  /** Wind across the view, -1 (leftwards) to 1 (rightwards). */
  wind: number
  /** Wind as a compass bearing it blows towards, and its speed in m/s. */
  windToward: number
  windSpeed: number
  sun: SkyPosition
  moon: MoonState
  /** Offset into the cloud pattern, so every place has its own clouds. */
  seed: [number, number]
  light: SkyLight
  palette: SkyPalette
  /** The sun is below the horizon. */
  night: boolean
}

const clamp = (value: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, value))

/** Map an hourly amount (mm/h) onto 0–1: ≈0.5 mm/h light, 4 mm/h moderate, 10+ heavy. */
const intensity = (mmPerHour: number) => clamp(0.15 + Math.log10(1 + mmPerHour) * 0.85)

export function sceneFor(obs: Observation, where: Coordinates, nowMs: number): WeatherScene {
  const sky = skyFor(obs)
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

  // Meteorological direction is where wind comes FROM; it blows the other way.
  const windToward = ((obs.wind_deg ?? 0) + 180) % 360
  const windSpeed = obs.wind_speed ?? 0
  const across = obs.wind_deg == null ? 0 : -Math.sin((obs.wind_deg * Math.PI) / 180)
  const wind = clamp(across * clamp(windSpeed / 15), -1, 1)

  // Rain and snow fall from a sky that is at least mostly covered.
  const precipitation = Math.max(rain, snow)
  const reported = clamp((obs.clouds ?? 0) / 100)
  const covered = sky === 'thunder' || precipitation >= 0.3 ? 0.95 : 0.9
  const clouds = precipitation > 0 || sky === 'thunder' ? Math.max(reported, covered) : reported
  const weather = { clouds, precipitation, fog }

  const sun = sunPosition(nowMs, where.lat, where.lon)
  const moon = moonState(nowMs, where.lat, where.lon)
  return {
    sky,
    rain,
    snow,
    clouds,
    fog,
    overcast: overcastFor(weather),
    thunder: sky === 'thunder',
    wind,
    windToward,
    windSpeed,
    sun,
    moon,
    seed: [((where.lat * 12.9898) % 1) * 97, ((where.lon * 78.233) % 1) * 97],
    light: skyLight(sun, moon),
    palette: skyPalette(sun, moon, weather),
    night: sun.altitude < -0.833,
  }
}
