import { describe, expect, it } from 'vitest'

import { clearSky, normalize, skyLight, skyPalette, toneMap, transmittance } from './atmosphere'
import { moonState, sunPosition } from './solar'

const toronto = { lat: 43.6535, lon: -79.3839 }
const clearWeather = { clouds: 0, precipitation: 0, fog: 0 }
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const palette = (iso: string, weather = clearWeather) => {
  const ms = Date.parse(iso)
  return skyPalette(
    sunPosition(ms, toronto.lat, toronto.lon),
    moonState(ms, toronto.lat, toronto.lon),
    weather,
  )
}

describe('clear sky colour', () => {
  it('is blue overhead at midday and paler towards the horizon', () => {
    const noon = palette('2026-10-21T16:50:00Z')
    const [r, g, b] = rgb(noon.zenith)
    expect(b).toBeGreaterThan(g!)
    expect(g).toBeGreaterThan(r!)
    expect(rgb(noon.horizon).reduce((a, c) => a + c)).toBeGreaterThan(r! + g! + b!)
  })

  it('glows orange towards the sun as it rises', () => {
    const [r, , b] = rgb(palette('2026-10-21T11:40:00Z').glow)
    expect(r).toBeGreaterThan(b! + 40)
  })

  it('is dark at night', () => {
    const night = palette('2026-10-22T03:00:00Z')
    expect(Math.max(...rgb(night.zenith))).toBeLessThan(70)
    expect(night.brightness).toBeLessThan(0.2)
  })

  it('reddens sunlight near the horizon and cuts it off below', () => {
    const high = transmittance(normalize([0, 1, 0.2]))
    const low = transmittance(normalize([0, 0.02, 1]))
    expect(high[2]).toBeGreaterThan(0.6)
    expect(low[0] / low[2]).toBeGreaterThan(high[0] / high[2])
    expect(transmittance(normalize([0, -0.2, 1]))).toEqual([0, 0, 0])
  })

  it('stays within display range', () => {
    const ms = Date.parse('2026-10-21T16:50:00Z')
    const light = skyLight(
      sunPosition(ms, toronto.lat, toronto.lon),
      moonState(ms, toronto.lat, toronto.lon),
    )
    for (const c of toneMap(clearSky(light.sun, light), light.exposure)) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})

describe('weather', () => {
  it('greys and darkens the sky in rain', () => {
    const clear = palette('2026-10-21T16:50:00Z')
    const rain = palette('2026-10-21T16:50:00Z', { clouds: 1, precipitation: 0.8, fog: 0 })
    const spread = (hex: string) => Math.max(...rgb(hex)) - Math.min(...rgb(hex))
    expect(spread(rain.zenith)).toBeLessThan(spread(clear.zenith) / 2)
    expect(rain.brightness).toBeLessThan(clear.brightness)
  })
})
