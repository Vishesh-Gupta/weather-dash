import type { ForecastEntry, HourlyEntry } from '../api/client'
import { skyFor, skyForCode, type Sky } from './sky'

export interface Slot {
  at: string
  sky: Sky
  /** °C */
  temp: number
  /** Chance of precipitation 0–1. */
  pop: number | null
}

const HOUR_MS = 3_600_000

/** Slots from the hourly forecast, starting with the current hour. */
export function hourlySlots(hours: readonly HourlyEntry[], nowMs: number, limit = 48): Slot[] {
  return hours
    .filter((h) => Date.parse(h.forecast_for) + HOUR_MS > nowMs)
    .slice(0, limit)
    .map((h) => ({
      at: h.forecast_for,
      sky: skyForCode(h.weather_code, h.is_day),
      temp: h.temp,
      pop: h.pop,
    }))
}

/** Slots from the 3-hourly forecast, for when the hourly one is unavailable. */
export function threeHourlySlots(entries: readonly ForecastEntry[], nowMs: number): Slot[] {
  return entries
    .filter((e) => Date.parse(e.forecast_for) > nowMs)
    .slice(0, 8)
    .map((e) => ({
      at: e.forecast_for,
      sky: skyFor({ ...e, observed_at: e.forecast_for, sunrise: null, sunset: null }),
      temp: e.temp,
      pop: e.pop,
    }))
}
