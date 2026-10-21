import type {
  AirQuality,
  DailyHistory,
  Forecast,
  Location,
  Observation,
  Session,
} from '../api/client'

export const toronto: Location = {
  id: 1,
  name: 'Toronto',
  state: 'Ontario',
  country: 'CA',
  display_name: 'Toronto, Ontario, CA',
  lat: 43.6535,
  lon: -79.3839,
  utc_offset_seconds: -14400,
}

const hour = (n: number) => new Date(Date.UTC(2026, 9, 21, 14) + n * 3_600_000).toISOString()

export const observation = (n = 0, temp = 17): Observation => ({
  observed_at: hour(-n),
  temp,
  feels_like: temp - 1.5,
  temp_min: null,
  temp_max: null,
  pressure: 1015,
  humidity: 65,
  visibility: 10000,
  wind_speed: 4.5,
  wind_deg: 250,
  wind_gust: 8,
  clouds: 40,
  rain_1h: null,
  snow_1h: null,
  weather_main: 'Clouds',
  weather_description: 'scattered clouds',
  weather_icon: '03d',
  sunrise: '2026-10-21T11:24:00Z',
  sunset: '2026-10-21T22:15:00Z',
})

export const forecast: Forecast = {
  issued_at: hour(0),
  entries: Array.from({ length: 16 }, (_, i) => ({
    forecast_for: hour(3 * (i + 1)),
    temp: 10 + (i % 4),
    feels_like: 8 + (i % 4),
    humidity: 70,
    pressure: 1014,
    wind_speed: 5,
    wind_deg: 240,
    clouds: 50,
    pop: i === 5 ? 0.8 : 0.1,
    rain_3h: i === 5 ? 1.2 : null,
    snow_3h: null,
    weather_main: i === 5 ? 'Rain' : 'Clouds',
    weather_description: null,
    weather_icon: null,
  })),
}

export const airQuality: AirQuality[] = Array.from({ length: 4 }, (_, i) => ({
  observed_at: hour(-3 * (3 - i)),
  aqi: 2,
  co: 210,
  no: 0.3,
  no2: 14,
  o3: 58,
  so2: 1.2,
  pm2_5: 6 + i,
  pm10: 10 + i,
  nh3: 0.9,
}))

export const history: DailyHistory[] = Array.from({ length: 400 }, (_, i) => {
  const date = new Date(Date.UTC(2025, 8, 16) + i * 86_400_000).toISOString().slice(0, 10)
  return {
    date,
    temp_max: 15 + (i % 10),
    temp_min: 5 + (i % 10),
    temp_mean: 10 + (i % 10),
    precipitation_sum: i % 5,
    rain_sum: i % 5,
    snowfall_sum: 0,
    wind_speed_max: 7,
    wind_gusts_max: 13,
    sunshine_duration: 25200,
  }
})

export const visitorSession: Session = { is_admin: false, auth_required: true, can_collect: true }
export const adminSession: Session = { is_admin: true, auth_required: true, can_collect: true }
