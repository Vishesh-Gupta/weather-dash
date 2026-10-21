// Stored values are metric (°C, m/s, mm, m); conversion happens at display time.

export type UnitSystem = 'metric' | 'imperial'

export interface Units {
  system: UnitSystem
  tempLabel: string
  windLabel: string
  precipLabel: string
  distanceLabel: string
  temp: (celsius: number) => number
  wind: (metersPerSecond: number) => number
  precip: (millimeters: number) => number
  distance: (meters: number) => number
}

export const METRIC: Units = {
  system: 'metric',
  tempLabel: '°C',
  windLabel: 'km/h',
  precipLabel: 'mm',
  distanceLabel: 'km',
  temp: (c) => c,
  wind: (ms) => ms * 3.6,
  precip: (mm) => mm,
  distance: (m) => m / 1000,
}

export const IMPERIAL: Units = {
  system: 'imperial',
  tempLabel: '°F',
  windLabel: 'mph',
  precipLabel: 'in',
  distanceLabel: 'mi',
  temp: (c) => (c * 9) / 5 + 32,
  wind: (ms) => ms * 2.236936,
  precip: (mm) => mm / 25.4,
  distance: (m) => m / 1609.344,
}

export const unitsFor = (system: UnitSystem): Units => (system === 'metric' ? METRIC : IMPERIAL)

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const // prettier-ignore

export function compass(degrees: number | null | undefined): string {
  if (degrees == null) return ''
  const normalized = ((degrees % 360) + 360) % 360
  return COMPASS_POINTS[Math.round(normalized / 22.5) % 16] ?? ''
}
