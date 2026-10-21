import { describe, expect, it } from 'vitest'

import { observation } from '../test/fixtures'
import { sceneFor } from './scene'

// Fixture day: sunrise 11:24 UTC, sunset 22:15 UTC.
const noon = Date.parse('2026-10-21T16:50:00Z')

describe('sceneFor', () => {
  it('describes a calm clear day', () => {
    const scene = sceneFor(
      { ...observation(), weather_main: 'Clear', weather_icon: '01d', clouds: 0 },
      noon,
    )
    expect(scene).toMatchObject({ theme: 'clear-day', rain: 0, snow: 0, fog: 0, stars: false })
    expect(scene.clock?.period).toBe('day')
  })

  it('turns clear skies into dawn and dusk near sunrise and sunset', () => {
    const clear = { ...observation(), weather_main: 'Clear', weather_icon: '01d', clouds: 0 }
    expect(sceneFor(clear, Date.parse('2026-10-21T11:40:00Z')).theme).toBe('dawn')
    expect(sceneFor(clear, Date.parse('2026-10-21T21:50:00Z')).theme).toBe('dusk')
    expect(
      sceneFor({ ...clear, weather_icon: '01n' }, Date.parse('2026-10-21T11:00:00Z')).theme,
    ).toBe('dawn')
  })

  it('scales rain with the hourly amount', () => {
    const rain = (mm: number | null) =>
      sceneFor({ ...observation(), weather_main: 'Rain', weather_icon: '10d', rain_1h: mm }, noon)
        .rain
    expect(rain(0.3)).toBeLessThan(rain(4))
    expect(rain(4)).toBeLessThan(rain(20))
    expect(rain(20)).toBeLessThanOrEqual(1)
    expect(rain(null)).toBe(0.5)
  })

  it('slants particles downwind', () => {
    // Wind from the west (270°) blows towards the east: rightwards.
    const westerly = sceneFor({ ...observation(), wind_deg: 270, wind_speed: 15 }, noon)
    expect(westerly.wind).toBeCloseTo(1)
    const easterly = sceneFor({ ...observation(), wind_deg: 90, wind_speed: 7.5 }, noon)
    expect(easterly.wind).toBeCloseTo(-0.5)
  })

  it('shows stars on clear nights only', () => {
    const night = Date.parse('2026-10-22T04:00:00Z')
    const clear = { ...observation(), weather_main: 'Clear', weather_icon: '01n', clouds: 5 }
    expect(sceneFor(clear, night).stars).toBe(true)
    expect(sceneFor({ ...clear, weather_main: 'Snow', weather_icon: '13n' }, night).stars).toBe(
      false,
    )
    expect(sceneFor({ ...clear, clouds: 95 }, night).stars).toBe(false)
  })

  it('thickens fog as visibility drops', () => {
    const fog = (visibility: number) =>
      sceneFor({ ...observation(), weather_main: 'Fog', weather_icon: '50d', visibility }, noon).fog
    expect(fog(200)).toBeGreaterThan(fog(4000))
    expect(fog(9000)).toBeGreaterThanOrEqual(0.5)
  })

  it('flags thunderstorms', () => {
    const scene = sceneFor(
      { ...observation(), weather_main: 'Thunderstorm', weather_icon: '11d' },
      noon,
    )
    expect(scene.thunder).toBe(true)
    expect(scene.rain).toBeGreaterThan(0.5)
  })
})
