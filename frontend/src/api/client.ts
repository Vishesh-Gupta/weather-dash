import type { components } from './schema'

type Schemas = components['schemas']

export type Location = Schemas['LocationOut']
export type LocationCreate = Schemas['LocationCreate']
export type GeocodeResult = Schemas['GeocodeResult']
export type Observation = Schemas['ObservationOut']
export type Forecast = Schemas['ForecastOut']
export type ForecastEntry = Schemas['ForecastEntryOut']
export type AirQuality = Schemas['AirQualityOut']
export type DailyHistory = Schemas['DailyHistoryOut']
export type CollectionRun = Schemas['CollectionRunOut']
export type Session = Schemas['SessionOut']
export type OverviewItem = Schemas['OverviewItem']
export type Normal = Schemas['NormalOut']
export type Hourly = Schemas['HourlyOut']
export type HourlyEntry = Schemas['HourlyEntryOut']
export type NowcastEntry = Schemas['NowcastEntryOut']

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) return 'The request was not valid.'
  } catch {
    // Non-JSON error body; fall through to the status text.
  }
  return response.statusText || `Request failed (${response.status})`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response))
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) })

export const api = {
  session: () => request<Session>('/session'),
  signIn: (password: string) =>
    request<Session>('/session', { method: 'POST', ...json({ password }) }),
  signOut: () => request<Session>('/session', { method: 'DELETE' }),

  locations: () => request<Location[]>('/locations'),
  location: (id: number) => request<Location>(`/locations/${id}`),
  current: (id: number) => request<Observation | null>(`/locations/${id}/current`),
  observations: (id: number, days: number) =>
    request<Observation[]>(`/locations/${id}/observations?days=${days}`),
  forecast: (id: number) => request<Forecast>(`/locations/${id}/forecast`),
  hourly: (id: number) => request<Hourly>(`/locations/${id}/hourly`),
  airQuality: (id: number, days: number) =>
    request<AirQuality[]>(`/locations/${id}/air-quality?days=${days}`),
  history: (id: number) => request<DailyHistory[]>(`/locations/${id}/history`),
  latestRun: () => request<CollectionRun | null>('/collection-runs/latest'),
  overview: () => request<OverviewItem[]>('/overview'),
  normals: (id: number, start?: string, end?: string) => {
    const params = new URLSearchParams()
    if (start) params.set('start', start)
    if (end) params.set('end', end)
    const query = params.toString()
    return request<Normal[]>(`/locations/${id}/normals${query ? `?${query}` : ''}`)
  },

  geocode: (query: string) => request<GeocodeResult[]>(`/geocode?q=${encodeURIComponent(query)}`),
  createLocation: (body: LocationCreate) =>
    request<Location>('/locations', { method: 'POST', ...json(body) }),
  deleteLocation: (id: number) => request<void>(`/locations/${id}`, { method: 'DELETE' }),
  collect: (locationIds?: number[]) =>
    request<{ status: string }>('/collection-runs', {
      method: 'POST',
      ...json({ location_ids: locationIds ?? null }),
    }),
}
