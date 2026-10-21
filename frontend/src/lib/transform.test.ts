import { describe, expect, it } from 'vitest'

import type { DailyHistory, ForecastEntry } from '../api/client'
import { completeMonthlyTotals, forecastByDay, historyStats, lastDays, toCsv } from './transform'

const slot = (iso: string, temp: number, extra: Partial<ForecastEntry> = {}): ForecastEntry => ({
  forecast_for: iso,
  temp,
  feels_like: temp,
  humidity: null,
  pressure: null,
  wind_speed: null,
  wind_deg: null,
  clouds: null,
  pop: 0,
  rain_3h: null,
  snow_3h: null,
  weather_main: 'Clouds',
  weather_description: null,
  weather_icon: null,
  ...extra,
})

const day = (date: string, extra: Partial<DailyHistory> = {}): DailyHistory => ({
  date,
  temp_max: 10,
  temp_min: 0,
  temp_mean: 5,
  precipitation_sum: 1,
  rain_sum: 1,
  snowfall_sum: 0,
  wind_speed_max: null,
  wind_gusts_max: null,
  sunshine_duration: null,
  ...extra,
})

describe('forecastByDay', () => {
  it('groups slots by location-local day', () => {
    // 02:00 UTC on the 22nd is still the 21st in Toronto (UTC−4).
    const days = forecastByDay(
      [
        slot('2026-10-21T18:00:00Z', 12, { pop: 0.2, rain_3h: 0.5 }),
        slot('2026-10-22T02:00:00Z', 6, { pop: 0.8, rain_3h: 1.5, weather_main: 'Rain' }),
        slot('2026-10-22T05:00:00Z', 4, { weather_main: 'Rain', snow_3h: 0.2 }),
        slot('2026-10-22T14:00:00Z', 9),
      ],
      -14400,
    )
    expect(days.map((d) => d.day)).toEqual(['2026-10-21', '2026-10-22'])
    expect(days[0]).toMatchObject({
      low: 6,
      high: 12,
      maxChance: 0.8,
      precipitation: 2,
      conditions: 'Clouds',
    })
    expect(days[1]?.precipitation).toBeCloseTo(0.2)
  })
})

describe('completeMonthlyTotals', () => {
  it('drops partially covered months', () => {
    const rows: DailyHistory[] = []
    for (let d = 15; d <= 31; d++) rows.push(day(`2026-01-${String(d).padStart(2, '0')}`))
    for (let d = 1; d <= 28; d++)
      rows.push(day(`2026-02-${String(d).padStart(2, '0')}`, { precipitation_sum: 2 }))
    const totals = completeMonthlyTotals(rows, 'precipitation_sum')
    expect(totals).toEqual([{ month: new Date('2026-02-01T00:00:00Z'), total: 56 }])
  })
})

describe('historyStats', () => {
  it('finds extremes and totals', () => {
    const stats = historyStats([
      day('2026-07-01', { temp_max: 31, precipitation_sum: 0 }),
      day('2026-01-10', { temp_min: -14, precipitation_sum: 12 }),
      day('2026-03-03', { temp_max: null, temp_min: null, precipitation_sum: null }),
    ])
    expect(stats.warmest).toMatchObject({ value: 31, date: new Date('2026-07-01T00:00:00Z') })
    expect(stats.coldest?.value).toBe(-14)
    expect(stats.wettest?.value).toBe(12)
    expect(stats.totalPrecipitation).toBe(12)
  })

  it('handles empty input', () => {
    expect(historyStats([])).toEqual({
      warmest: undefined,
      coldest: undefined,
      wettest: undefined,
      totalPrecipitation: undefined,
    })
  })
})

describe('lastDays', () => {
  it('keeps the trailing window', () => {
    const rows = [day('2026-01-01'), day('2026-01-02'), day('2026-01-03')]
    expect(lastDays(rows, 2).map((r) => r.date)).toEqual(['2026-01-02', '2026-01-03'])
    expect(lastDays(rows, null)).toHaveLength(3)
  })
})

describe('toCsv', () => {
  it('escapes values', () => {
    expect(toCsv([{ a: 'x,y', b: 1, c: null }])).toBe('a,b,c\n"x,y",1,')
  })
})
