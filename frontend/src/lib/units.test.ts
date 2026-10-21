import { describe, expect, it } from 'vitest'

import { IMPERIAL, METRIC, compass } from './units'

describe('units', () => {
  it('converts metric values for imperial display', () => {
    expect(IMPERIAL.temp(100)).toBe(212)
    expect(IMPERIAL.temp(-40)).toBe(-40)
    expect(IMPERIAL.wind(10)).toBeCloseTo(22.37, 2)
    expect(IMPERIAL.precip(25.4)).toBe(1)
    expect(IMPERIAL.distance(1609.344)).toBe(1)
  })

  it('shows wind in km/h for metric', () => {
    expect(METRIC.wind(10)).toBe(36)
    expect(METRIC.distance(10000)).toBe(10)
  })

  it.each([
    [0, 'N'],
    [359, 'N'],
    [45, 'NE'],
    [250, 'WSW'],
    [-90, 'W'],
    [null, ''],
  ])('compass(%s) = %s', (deg, expected) => {
    expect(compass(deg)).toBe(expected)
  })
})
