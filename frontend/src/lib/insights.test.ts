import { describe, expect, it } from 'vitest'

import { forecast, hourly, observation, toronto } from '../test/fixtures'
import {
  STALE_FORECAST_MS,
  STALE_READING_MS,
  beaufort,
  cloudLabel,
  dewPoint,
  humidityFeel,
  isStale,
  nextHourRain,
  precipitationAhead,
  pressureTrend,
  versusNormal,
  uvLevel,
  uvOutlook,
  visibilityLabel,
} from './insights'

describe('beaufort', () => {
  it('names wind speeds on the Beaufort scale', () => {
    expect(beaufort(0.2)).toEqual({ force: 0, label: 'Calm' })
    expect(beaufort(4.5)).toEqual({ force: 3, label: 'Gentle breeze' })
    expect(beaufort(15)).toEqual({ force: 7, label: 'Near gale' })
    expect(beaufort(40)).toEqual({ force: 12, label: 'Hurricane force' })
  })
})

describe('dew point', () => {
  it('matches reference values', () => {
    // 20 °C at 50% → 9.3 °C; 30 °C at 70% → 23.9 °C; saturated air → the temperature.
    expect(dewPoint(20, 50)).toBeCloseTo(9.3, 1)
    expect(dewPoint(30, 70)).toBeCloseTo(23.9, 1)
    expect(dewPoint(15, 100)).toBeCloseTo(15, 5)
  })

  it('describes how humid warm air feels from the dew point', () => {
    expect(humidityFeel(5, 25, 25)).toBe('Dry')
    expect(humidityFeel(12, 20, 60)).toBe('Comfortable')
    expect(humidityFeel(19, 26, 65)).toBe('Humid')
    expect(humidityFeel(26, 32, 75)).toBe('Oppressive')
  })

  it('describes cool air by relative humidity', () => {
    // 80% at 11 °C has a dew point of 8 °C ("dry" on the warm-air scale) but feels humid.
    expect(humidityFeel(dewPoint(11, 80), 11, 80)).toBe('Humid')
    expect(humidityFeel(dewPoint(6, 92), 6, 92)).toBe('Damp')
    expect(humidityFeel(dewPoint(8, 50), 8, 50)).toBe('Comfortable')
  })
})

describe('pressureTrend', () => {
  const series = (pressures: number[]) =>
    pressures.map((pressure, i) => ({ ...observation(pressures.length - 1 - i), pressure }))

  it('compares with the reading three hours earlier', () => {
    expect(pressureTrend(series([1015, 1014, 1013, 1012, 1011]))).toEqual({
      change: -3,
      label: 'Falling',
    })
    expect(pressureTrend(series([1010, 1012, 1013, 1015]))?.label).toBe('Rising quickly')
    expect(pressureTrend(series([1013, 1013.4, 1013.2, 1013.5]))?.label).toBe('Steady')
  })

  it('needs a reading from about three hours ago', () => {
    expect(pressureTrend(series([1013, 1014]))).toBeNull()
    expect(pressureTrend([])).toBeNull()
  })
})

describe('labels', () => {
  it('describes cloud cover and visibility', () => {
    expect(cloudLabel(0)).toBe('Clear')
    expect(cloudLabel(40)).toBe('Partly cloudy')
    expect(cloudLabel(100)).toBe('Overcast')
    expect(visibilityLabel(10000)).toBe('Excellent')
    expect(visibilityLabel(3000)).toBe('Moderate')
    expect(visibilityLabel(400)).toBe('Fog')
  })
})

describe('precipitationAhead', () => {
  // Fixture forecast: 3-hourly from 17:00 UTC; the 6th slot (08:00 next day) is rainy.
  const at = (iso: string) => Date.parse(iso)

  it('looks dry when nothing is likely', () => {
    const ahead = precipitationAhead(forecast.entries, at('2026-10-21T14:00:00Z'))
    expect(ahead).toMatchObject({ kind: null, at: null })
    expect(ahead?.chance).toBeCloseTo(0.1)
  })

  it('finds the rain and when it is most likely', () => {
    const ahead = precipitationAhead(forecast.entries, at('2026-10-22T04:00:00Z'))
    expect(ahead).toMatchObject({ kind: 'rain', at: '2026-10-22T08:00:00.000Z', chance: 0.8 })
    expect(ahead?.amount).toBeCloseTo(1.2)
  })

  it('says "now" rather than a time already past', () => {
    const ahead = precipitationAhead(forecast.entries, at('2026-10-22T09:40:00Z'))
    expect(ahead).toMatchObject({ kind: 'rain', at: '2026-10-22T09:40:00.000Z' })
  })

  it('has nothing to say beyond the forecast', () => {
    expect(precipitationAhead(forecast.entries, at('2026-11-01T00:00:00Z'))).toBeNull()
  })
})

describe('versusNormal', () => {
  it('reports the difference and whether it is notable', () => {
    expect(versusNormal(19, 15.5)).toEqual({ difference: 3.5, notable: true })
    expect(versusNormal(15.8, 15.5)?.notable).toBe(false)
    expect(versusNormal(null, 15)).toBeNull()
  })
})

describe('isStale', () => {
  const now = Date.parse('2026-10-26T12:00:00Z')

  it('flags readings older than the limit', () => {
    expect(isStale('2026-10-26T10:00:00Z', now, STALE_READING_MS)).toBe(false)
    expect(isStale('2026-10-26T08:30:00Z', now, STALE_READING_MS)).toBe(true)
    expect(isStale('2026-10-25T13:00:00Z', now, STALE_FORECAST_MS)).toBe(false)
    expect(isStale('2026-10-21T18:00:00Z', now, STALE_FORECAST_MS)).toBe(true)
  })

  it('treats a missing time as not stale', () => {
    expect(isStale(null, now, STALE_READING_MS)).toBe(false)
  })
})

describe('uvLevel', () => {
  it('uses the WHO categories on the rounded index', () => {
    expect(uvLevel(2.4).label).toBe('Low')
    expect(uvLevel(2.6).label).toBe('Moderate')
    expect(uvLevel(6).label).toBe('High')
    expect(uvLevel(9).label).toBe('Very high')
    expect(uvLevel(11.2).label).toBe('Extreme')
  })
})

describe('uvOutlook', () => {
  const at = (iso: string) => Date.parse(iso)
  const offset = toronto.utc_offset_seconds

  it('gives the peak still to come today', () => {
    // 10:30 local: UV 2.6, peaking at 3.4 around noon.
    expect(uvOutlook(hourly.hours, at('2026-10-21T14:30:00Z'), offset)).toEqual({
      now: 2.6,
      peak: { uv: 3.4, at: hourly.hours[2]!.forecast_for, tomorrow: false },
    })
  })

  it('says nothing more once the peak has passed', () => {
    expect(uvOutlook(hourly.hours, at('2026-10-21T21:30:00Z'), offset)).toEqual({
      now: 1,
      peak: null,
    })
  })

  it("looks ahead to tomorrow's peak after dark", () => {
    const outlook = uvOutlook(hourly.hours, at('2026-10-21T23:30:00Z'), offset)
    expect(outlook?.now).toBe(0)
    expect(outlook?.peak).toEqual({ uv: 3.4, at: hourly.hours[26]!.forecast_for, tomorrow: true })
  })

  it('needs the current hour', () => {
    expect(uvOutlook(hourly.hours, at('2026-10-30T12:00:00Z'), offset)).toBeNull()
  })
})

describe('nextHourRain', () => {
  const at = (iso: string) => Date.parse(iso)
  const quarters = (mm: number[], snow = 0) =>
    mm.map((precipitation, i) => ({
      forecast_for: new Date(at('2026-10-21T14:30:00Z') + i * 900_000).toISOString(),
      precipitation,
      snowfall: precipitation ? snow : 0,
    }))

  it('says when rain will start', () => {
    const rain = nextHourRain(hourly.nowcast, at('2026-10-21T14:35:00Z'))
    expect(rain?.summary).toEqual({
      state: 'starting',
      at: '2026-10-21T15:45:00.000Z',
      kind: 'rain',
    })
    // 0.3 mm in 15 minutes is 1.2 mm/h.
    expect(rain?.slots[6]!.rate).toBeCloseTo(1.2)
  })

  it('says when rain will stop, or that it will keep on', () => {
    expect(
      nextHourRain(quarters([0.2, 0.2, 0.1, 0, 0, 0, 0, 0]), at('2026-10-21T14:31:00Z'))?.summary,
    ).toEqual({
      state: 'ongoing',
      until: '2026-10-21T15:15:00.000Z',
      kind: 'rain',
    })
    expect(
      nextHourRain(quarters(Array(8).fill(0.2), 0.3), at('2026-10-21T14:31:00Z'))?.summary,
    ).toEqual({
      state: 'ongoing',
      until: null,
      kind: 'snow',
    })
  })

  it('ignores traces and stale nowcasts', () => {
    expect(
      nextHourRain(quarters([0, 0.01, 0, 0, 0, 0, 0, 0]), at('2026-10-21T14:31:00Z'))?.summary,
    ).toEqual({
      state: 'dry',
    })
    expect(nextHourRain(hourly.nowcast, at('2026-10-21T16:00:00Z'))).toBeNull()
  })
})
