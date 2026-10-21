import type { DailyHistory, ForecastEntry } from '../api/client'
import { dayKey, parseDate, toLocationTime } from './time'

export interface ForecastDay {
  day: string
  date: Date
  low: number
  high: number
  maxChance: number
  precipitation: number
  conditions: string
}

function mode(values: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = ''
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/** Group 3-hourly forecast slots into location-local calendar days (metric values). */
export function forecastByDay(
  entries: readonly ForecastEntry[],
  utcOffsetSeconds: number | null,
): ForecastDay[] {
  const days = new Map<string, ForecastEntry[]>()
  for (const entry of entries) {
    const key = dayKey(toLocationTime(entry.forecast_for, utcOffsetSeconds))
    days.set(key, [...(days.get(key) ?? []), entry])
  }
  return [...days.entries()].map(([day, slots]) => ({
    day,
    date: parseDate(day),
    low: Math.min(...slots.map((s) => s.temp)),
    high: Math.max(...slots.map((s) => s.temp)),
    maxChance: Math.max(...slots.map((s) => s.pop ?? 0)),
    precipitation: slots.reduce((sum, s) => sum + (s.rain_3h ?? 0) + (s.snow_3h ?? 0), 0),
    conditions: mode(slots.map((s) => s.weather_main ?? '').filter(Boolean)),
  }))
}

/** Monthly totals of a daily field, keeping only months the data fully covers. */
export function completeMonthlyTotals(
  rows: readonly DailyHistory[],
  field: 'precipitation_sum' | 'rain_sum' | 'snowfall_sum',
): { month: Date; total: number }[] {
  const months = new Map<string, { total: number; days: number }>()
  for (const row of rows) {
    const value = row[field]
    if (value == null) continue
    const key = row.date.slice(0, 7)
    const month = months.get(key) ?? { total: 0, days: 0 }
    month.total += value
    month.days += 1
    months.set(key, month)
  }
  return [...months.entries()]
    .filter(([key, { days }]) => {
      const [year, month] = key.split('-').map(Number) as [number, number]
      return days === new Date(Date.UTC(year, month, 0)).getUTCDate()
    })
    .map(([key, { total }]) => ({ month: parseDate(`${key}-01`), total }))
    .sort((a, b) => a.month.getTime() - b.month.getTime())
}

export interface HistoryStat {
  label: string
  value: number
  date?: Date
}

/** Warmest, coldest and wettest days plus total precipitation (metric values). */
export function historyStats(rows: readonly DailyHistory[]): {
  warmest?: HistoryStat
  coldest?: HistoryStat
  wettest?: HistoryStat
  totalPrecipitation?: number
} {
  const pick = (
    field: 'temp_max' | 'temp_min' | 'precipitation_sum',
    better: (a: number, b: number) => boolean,
  ) => {
    let best: DailyHistory | undefined
    for (const row of rows) {
      const value = row[field]
      if (value == null) continue
      const current = best?.[field]
      if (current == null || better(value, current)) best = row
    }
    const value = best?.[field]
    return best && value != null ? { label: field, value, date: parseDate(best.date) } : undefined
  }
  const precip = rows.map((r) => r.precipitation_sum).filter((v): v is number => v != null)
  return {
    warmest: pick('temp_max', (a, b) => a > b),
    coldest: pick('temp_min', (a, b) => a < b),
    wettest: pick('precipitation_sum', (a, b) => a > b),
    totalPrecipitation: precip.length ? precip.reduce((a, b) => a + b, 0) : undefined,
  }
}

/** Rows within the last `days` days of the data (inclusive of the last day). */
export function lastDays<T extends { date: string }>(
  rows: readonly T[],
  days: number | null,
): readonly T[] {
  if (days == null || rows.length === 0) return rows
  const last = parseDate(rows[rows.length - 1]!.date).getTime()
  const cutoff = last - (days - 1) * 86_400_000
  return rows.filter((row) => parseDate(row.date).getTime() >= cutoff)
}

export function toCsv(rows: readonly Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0]!)
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\n')
}
