import { describe, expect, it } from 'vitest'

import { moonState, sunPosition, toVector } from './solar'

const toronto = { lat: 43.6535, lon: -79.3839 }
const at = (iso: string) => Date.parse(iso)

describe('sunPosition', () => {
  it('puts the sun on the horizon at sunrise', () => {
    // Published sunrise for Toronto on 21 October 2026: 07:39 EDT. The sun's centre is
    // then 0.83° below the geometric horizon (refraction plus the disc's radius).
    const sun = sunPosition(at('2026-10-21T11:39:00Z'), toronto.lat, toronto.lon)
    expect(sun.altitude).toBeCloseTo(-0.83, 0)
    expect(sun.azimuth).toBeGreaterThan(100)
    expect(sun.azimuth).toBeLessThan(110)
  })

  it('reaches 90° − latitude + 23.44° at the June solstice noon', () => {
    const sun = sunPosition(at('2026-06-21T17:22:00Z'), toronto.lat, toronto.lon)
    expect(sun.altitude).toBeCloseTo(90 - toronto.lat + 23.44, 0)
    expect(sun.azimuth).toBeCloseTo(180, -1)
  })

  it('puts the noon sun in the northern sky in Sydney', () => {
    const sun = sunPosition(at('2026-10-21T02:00:00Z'), -33.87, 151.21)
    expect(sun.altitude).toBeGreaterThan(60)
    expect(Math.abs(((sun.azimuth + 180) % 360) - 180)).toBeLessThan(30)
  })
})

describe('moonState', () => {
  it('matches the published phases of January 2026', () => {
    const phase = (iso: string) => moonState(at(iso), toronto.lat, toronto.lon)
    expect(phase('2026-01-03T10:03:00Z').illumination).toBeGreaterThan(0.99)
    expect(phase('2026-01-18T19:52:00Z').illumination).toBeLessThan(0.01)
    expect(phase('2026-01-26T04:47:00Z').phase).toBeCloseTo(0.25, 1)
    expect(phase('2026-01-10T15:48:00Z').phase).toBeCloseTo(0.75, 1)
  })
})

describe('toVector', () => {
  it('maps bearings onto east/up/north axes', () => {
    const [x, y, z] = toVector({ altitude: 0, azimuth: 90 })
    expect(x).toBeCloseTo(1)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(0)
    expect(toVector({ altitude: 90, azimuth: 0 })[1]).toBeCloseTo(1)
  })
})
