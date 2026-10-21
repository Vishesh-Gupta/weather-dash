export type StatusRole = 'good' | 'warning' | 'serious' | 'critical'

// OpenWeather's 1–5 Air Quality Index.
export const AQI_LEVELS: Record<number, { label: string; role: StatusRole }> = {
  1: { label: 'Good', role: 'good' },
  2: { label: 'Fair', role: 'good' },
  3: { label: 'Moderate', role: 'warning' },
  4: { label: 'Poor', role: 'serious' },
  5: { label: 'Very poor', role: 'critical' },
}

export function aqiLevel(aqi: number) {
  return AQI_LEVELS[aqi] ?? { label: 'Unknown', role: null }
}

export const POLLUTANTS = [
  { key: 'pm2_5', label: 'PM2.5' },
  { key: 'pm10', label: 'PM10' },
  { key: 'o3', label: 'O₃' },
  { key: 'no2', label: 'NO₂' },
  { key: 'so2', label: 'SO₂' },
  { key: 'no', label: 'NO' },
  { key: 'nh3', label: 'NH₃' },
  { key: 'co', label: 'CO' },
] as const
