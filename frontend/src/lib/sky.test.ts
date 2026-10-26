import { describe, expect, it } from 'vitest'

import { codeLabel, isDaytime, skyFor, skyForCode } from './sky'

const base = {
  observed_at: '2026-10-21T16:00:00Z',
  sunrise: '2026-10-21T11:24:00Z',
  sunset: '2026-10-21T22:15:00Z',
  clouds: 40,
}

describe('sky', () => {
  it.each([
    ['Clear', '01d', 'clear-day'],
    ['Clear', '01n', 'clear-night'],
    ['Clouds', '02d', 'partly-day'],
    ['Clouds', '03n', 'partly-night'],
    ['Clouds', '04d', 'clouds-day'],
    ['Drizzle', '09d', 'drizzle'],
    ['Rain', '10n', 'rain'],
    ['Thunderstorm', '11d', 'thunder'],
    ['Snow', '13d', 'snow'],
    ['Fog', '50n', 'mist'],
  ])('%s %s → %s', (main, icon, sky) => {
    expect(skyFor({ ...base, weather_main: main, weather_icon: icon })).toBe(sky)
  })

  it('falls back to sunrise and sunset without an icon code', () => {
    expect(isDaytime({ ...base, weather_main: 'Clear', weather_icon: null })).toBe(true)
    expect(
      isDaytime({
        ...base,
        observed_at: '2026-10-21T23:30:00Z',
        weather_main: 'Clear',
        weather_icon: null,
      }),
    ).toBe(false)
  })
})

describe('WMO weather codes', () => {
  it('map to skies and labels', () => {
    expect(skyForCode(0, false)).toBe('clear-night')
    expect(skyForCode(2, true)).toBe('partly-day')
    expect(skyForCode(3, false)).toBe('clouds-night')
    expect(skyForCode(45, true)).toBe('mist')
    expect(skyForCode(53, true)).toBe('drizzle')
    expect(skyForCode(81, true)).toBe('rain')
    expect(skyForCode(86, true)).toBe('snow')
    expect(skyForCode(95, true)).toBe('thunder')
    expect(codeLabel(63)).toBe('Rain')
    expect(codeLabel(66)).toBe('Freezing rain')
    expect(codeLabel(96)).toBe('Thunderstorm')
    expect(codeLabel(null)).toBe('Unknown')
  })
})
