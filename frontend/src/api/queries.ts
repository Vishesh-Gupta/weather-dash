import { queryOptions } from '@tanstack/react-query'

import { api } from './client'

// Collected data changes at most once per scheduler interval (hourly by default).
const DATA_STALE_MS = 5 * 60 * 1000

export const queryKeys = {
  session: ['session'] as const,
  locations: ['locations'] as const,
  location: (id: number) => ['locations', id] as const,
  latestRun: ['collection-runs', 'latest'] as const,
  overview: ['overview'] as const,
}

/** Per-location query suffixes affected by each kind of collected data. */
export const KIND_QUERIES: Record<string, readonly string[]> = {
  current: ['current', 'observations'],
  forecast: ['forecast'],
  hourly: ['hourly'],
  air_quality: ['air-quality'],
}

export const sessionQuery = () =>
  queryOptions({ queryKey: queryKeys.session, queryFn: api.session, staleTime: Infinity })

export const locationsQuery = () =>
  queryOptions({ queryKey: queryKeys.locations, queryFn: api.locations, staleTime: DATA_STALE_MS })

export const currentQuery = (id: number) =>
  queryOptions({
    queryKey: [...queryKeys.location(id), 'current'],
    queryFn: () => api.current(id),
    staleTime: DATA_STALE_MS,
  })

export const observationsQuery = (id: number, days: number) =>
  queryOptions({
    queryKey: [...queryKeys.location(id), 'observations', days],
    queryFn: () => api.observations(id, days),
    staleTime: DATA_STALE_MS,
  })

export const forecastQuery = (id: number) =>
  queryOptions({
    queryKey: [...queryKeys.location(id), 'forecast'],
    queryFn: () => api.forecast(id),
    staleTime: DATA_STALE_MS,
  })

export const hourlyQuery = (id: number) =>
  queryOptions({
    queryKey: [...queryKeys.location(id), 'hourly'],
    queryFn: () => api.hourly(id),
    staleTime: DATA_STALE_MS,
  })

export const airQualityQuery = (id: number, days: number) =>
  queryOptions({
    queryKey: [...queryKeys.location(id), 'air-quality', days],
    queryFn: () => api.airQuality(id, days),
    staleTime: DATA_STALE_MS,
  })

export const historyQuery = (id: number) =>
  queryOptions({
    queryKey: [...queryKeys.location(id), 'history'],
    queryFn: () => api.history(id),
    // Daily history only changes once a day.
    staleTime: 60 * 60 * 1000,
  })

export const latestRunQuery = () =>
  queryOptions({ queryKey: queryKeys.latestRun, queryFn: api.latestRun, staleTime: 60 * 1000 })

export const locationQuery = (id: number) =>
  queryOptions({
    queryKey: queryKeys.location(id),
    queryFn: () => api.location(id),
    staleTime: DATA_STALE_MS,
  })

export const overviewQuery = () =>
  queryOptions({ queryKey: queryKeys.overview, queryFn: api.overview, staleTime: DATA_STALE_MS })

export const normalsQuery = (id: number, start?: string, end?: string) =>
  queryOptions({
    queryKey: [...queryKeys.location(id), 'normals', start ?? 'today', end ?? start ?? 'today'],
    queryFn: () => api.normals(id, start, end),
    // Normals only move as history accumulates.
    staleTime: 6 * 60 * 60 * 1000,
  })
