import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { vi } from 'vitest'

import { PreferencesProvider } from '../preferences'
import { createAppRouter } from '../router'
import { airQuality, forecast, history, observation, toronto, visitorSession } from './fixtures'

type Handler = (request: { method: string; url: URL; body: unknown }) => unknown

/** Routes keyed by "METHOD /api/path"; a function result becomes the JSON body.
 *  Throw `{ status, detail }` from a handler to return an error response. */
export type Routes = Record<string, unknown | Handler>

export const defaultRoutes = (): Routes => ({
  'GET /api/session': visitorSession,
  'GET /api/locations': [toronto],
  'GET /api/locations/1': toronto,
  'GET /api/locations/1/current': observation(),
  'GET /api/locations/1/observations': Array.from({ length: 48 }, (_, i) =>
    observation(47 - i, 10 + (i % 8)),
  ),
  'GET /api/locations/1/forecast': forecast,
  'GET /api/locations/1/air-quality': airQuality,
  'GET /api/locations/1/history': history,
  'GET /api/collection-runs/latest': {
    id: 1,
    started_at: '2026-10-21T14:00:00Z',
    finished_at: '2026-10-21T14:00:05Z',
    status: 'success',
    locations_processed: 1,
    errors: null,
  },
})

export function mockApi(overrides: Routes = {}) {
  const routes = { ...defaultRoutes(), ...overrides }
  const calls: { method: string; path: string; body: unknown }[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), 'http://localhost')
    const method = (init.method ?? 'GET').toUpperCase()
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path: url.pathname + url.search, body })
    const route = routes[`${method} ${url.pathname}`]
    if (route === undefined) return Response.json({ detail: 'Not found' }, { status: 404 })
    try {
      const result = typeof route === 'function' ? (route as Handler)({ method, url, body }) : route
      if (result === null && method === 'DELETE') return new Response(null, { status: 204 })
      return Response.json(result)
    } catch (error) {
      const { status = 500, detail = 'Server error' } = error as {
        status?: number
        detail?: string
      }
      return Response.json({ detail }, { status })
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }))
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <RouterProvider router={router} />
      </PreferencesProvider>
    </QueryClientProvider>,
  )
  return { ...utils, router, queryClient }
}
