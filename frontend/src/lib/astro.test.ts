import { describe, expect, it } from 'vitest'

import { arcPoint, formatDuration, moonLitPath, moonPhase, moonPhaseName, skyClock } from './astro'

describe('moon', () => {
  it('matches known phases', () => {
    // Published full moon: 2024-01-25 17:54 UTC; new moon: 2024-01-11 11:57 UTC.
    expect(moonPhaseName(moonPhase(Date.UTC(2024, 0, 25, 17, 54)))).toBe('Full moon')
    expect(moonPhaseName(moonPhase(Date.UTC(2024, 0, 11, 11, 57)))).toBe('New moon')
  })

  it('stays within range before the reference date', () => {
    const phase = moonPhase(Date.UTC(1990, 0, 1))
    expect(phase).toBeGreaterThanOrEqual(0)
    expect(phase).toBeLessThan(1)
  })

  it('draws a valid lit path for every phase', () => {
    for (let p = 0; p < 1; p += 0.05) {
      expect(moonLitPath(p, 20, 20, 10)).toMatch(/^M [\d.]+ [\d.]+ A .* Z$/)
      expect(moonLitPath(p, 20, 20, 10)).not.toMatch(/NaN/)
    }
  })
})

describe('skyClock', () => {
  const sunrise = '2026-10-21T11:24:00Z'
  const sunset = '2026-10-21T22:15:00Z'

  it('tracks the day arc', () => {
    const clock = skyClock(Date.parse('2026-10-21T16:49:30Z'), sunrise, sunset)
    expect(clock.period).toBe('day')
    expect(clock.progress).toBeCloseTo(0.5, 2)
    expect(clock.next).toEqual({ kind: 'sunset', at: Date.parse(sunset) })
    expect(formatDuration(clock.dayLengthMs)).toBe('10 h 51 min')
  })

  it('tracks the night after sunset', () => {
    const clock = skyClock(Date.parse('2026-10-22T05:00:00Z'), sunrise, sunset)
    expect(clock.period).toBe('night')
    expect(clock.next.kind).toBe('sunrise')
    expect(clock.next.at).toBe(Date.parse('2026-10-22T11:24:00Z'))
    expect(clock.progress).toBeGreaterThan(0.4)
    expect(clock.progress).toBeLessThan(0.75)
  })

  it('tracks the night before sunrise', () => {
    const clock = skyClock(Date.parse('2026-10-21T09:00:00Z'), sunrise, sunset)
    expect(clock.period).toBe('night')
    expect(clock.next.at).toBe(Date.parse(sunrise))
    expect(clock.progress).toBeGreaterThan(0.8)
  })

  it('rolls stale times forward to today', () => {
    const clock = skyClock(Date.parse('2026-10-23T16:49:30Z'), sunrise, sunset)
    expect(clock.period).toBe('day')
    expect(clock.next.at).toBe(Date.parse(sunset) + 2 * 86_400_000)
  })
})

describe('arcPoint', () => {
  it('runs from the left edge over the top to the right edge', () => {
    const start = arcPoint(0, 200, 100)
    expect(start.x).toBeCloseTo(0)
    expect(start.y).toBeCloseTo(100)
    const top = arcPoint(0.5, 200, 100)
    expect(top.x).toBeCloseTo(100)
    expect(top.y).toBeCloseTo(0)
    expect(arcPoint(1, 200, 100).x).toBeCloseTo(200)
  })
})

describe('formatDuration', () => {
  it.each([
    [45 * 60_000, '45 min'],
    [3 * 3_600_000 + 5 * 60_000, '3 h 05 min'],
    [-5, '0 min'],
  ])('%s → %s', (ms, text) => expect(formatDuration(ms)).toBe(text))
})
