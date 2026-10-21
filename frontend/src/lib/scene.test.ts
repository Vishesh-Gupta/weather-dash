import { describe, expect, it } from 'vitest'

import { observation, toronto } from '../test/fixtures'
import { sceneFor } from './scene'

// Fixture day in Toronto: sunrise ≈ 11:39 UTC, solar noon ≈ 16:50 UTC.
const noon = Date.parse('2026-10-21T16:50:00Z')
const scene = (overrides: Partial<ReturnType<typeof observation>>, at = noon) =>
  sceneFor({ ...observation(), ...overrides }, toronto, at)

describe('sceneFor', () => {
  it('describes a calm clear day with the sun high in the south', () => {
    const clear = scene({ weather_main: 'Clear', weather_icon: '01d', clouds: 0 })
    expect(clear).toMatchObject({ sky: 'clear-day', rain: 0, snow: 0, fog: 0, night: false })
    expect(clear.sun.altitude).toBeGreaterThan(30)
    expect(clear.sun.azimuth).toBeGreaterThan(170)
    expect(clear.sun.azimuth).toBeLessThan(190)
  })

  it('is night once the sun is below the horizon', () => {
    expect(scene({}, Date.parse('2026-10-22T03:00:00Z')).night).toBe(true)
    expect(scene({}, Date.parse('2026-10-21T11:20:00Z')).night).toBe(true)
    expect(scene({}, Date.parse('2026-10-21T12:00:00Z')).night).toBe(false)
  })

  it('scales rain with the hourly amount', () => {
    const rain = (mm: number | null) =>
      scene({ weather_main: 'Rain', weather_icon: '10d', rain_1h: mm }).rain
    expect(rain(0.3)).toBeLessThan(rain(4))
    expect(rain(4)).toBeLessThan(rain(20))
    expect(rain(20)).toBeLessThanOrEqual(1)
    expect(rain(null)).toBe(0.5)
  })

  it('covers the sky when it rains or snows', () => {
    expect(scene({ weather_main: 'Drizzle', weather_icon: '09d', clouds: 20 }).clouds).toBe(0.9)
    expect(scene({ weather_main: 'Rain', weather_icon: '10d', clouds: 20 }).clouds).toBe(0.95)
    expect(scene({ weather_main: 'Snow', weather_icon: '13d', clouds: 100 }).clouds).toBe(1)
    expect(scene({ weather_main: 'Clouds', weather_icon: '03d', clouds: 40 }).clouds).toBe(0.4)
  })

  it('moves weather downwind', () => {
    // Wind from the west (270°) blows towards the east: rightwards, bearing 90°.
    const westerly = scene({ wind_deg: 270, wind_speed: 15 })
    expect(westerly.wind).toBeCloseTo(1)
    expect(westerly.windToward).toBe(90)
    expect(westerly.windSpeed).toBe(15)
    expect(scene({ wind_deg: 90, wind_speed: 7.5 }).wind).toBeCloseTo(-0.5)
  })

  it('thickens fog as visibility drops', () => {
    const fog = (visibility: number) =>
      scene({ weather_main: 'Fog', weather_icon: '50d', visibility }).fog
    expect(fog(200)).toBeGreaterThan(fog(4000))
    expect(fog(9000)).toBeGreaterThanOrEqual(0.5)
  })

  it('flags thunderstorms', () => {
    const storm = scene({ weather_main: 'Thunderstorm', weather_icon: '11d' })
    expect(storm.thunder).toBe(true)
    expect(storm.rain).toBeGreaterThan(0.5)
  })

  it('greys the sky palette under heavy cloud', () => {
    const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
    const saturation = (c: string) => Math.max(...hex(c)) - Math.min(...hex(c))
    const clear = scene({ weather_main: 'Clear', weather_icon: '01d', clouds: 0 }).palette
    const rain = scene({
      weather_main: 'Rain',
      weather_icon: '10d',
      clouds: 100,
      rain_1h: 6,
    }).palette
    expect(saturation(rain.zenith)).toBeLessThan(saturation(clear.zenith))
    expect(rain.brightness).toBeLessThan(clear.brightness)
  })
})
