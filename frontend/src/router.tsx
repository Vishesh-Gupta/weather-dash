import type { QueryClient } from '@tanstack/react-query'
import {
  type RouterHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
  redirect,
} from '@tanstack/react-router'

import { ApiError } from './api/client'
import { locationQuery, locationsQuery, sessionQuery } from './api/queries'
import {
  HISTORY_PERIODS,
  OBSERVATION_WINDOWS,
  type HistoryPeriod,
  type ObservationWindow,
} from './lib/periods'
import { Layout } from './components/Layout'
import { HomePage } from './pages/Home'
import { LocationLayout } from './pages/LocationLayout'
import { NotFoundPage } from './pages/NotFound'

export interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Layout,
  notFoundComponent: NotFoundPage,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: async ({ context }) => {
    const locations = await context.queryClient.ensureQueryData(locationsQuery())
    const first = locations[0]
    if (first)
      throw redirect({
        to: '/locations/$locationId',
        params: { locationId: first.id },
        replace: true,
      })
  },
  component: HomePage,
})

export const locationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'locations/$locationId',
  params: {
    parse: ({ locationId }) => {
      const id = Number(locationId)
      if (!Number.isInteger(id) || id <= 0) throw notFound()
      return { locationId: id }
    },
    stringify: ({ locationId }) => ({ locationId: String(locationId) }),
  },
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(locationQuery(params.locationId))
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound()
      throw error
    }
  },
  component: LocationLayout,
})

export const nowRoute = createRoute({
  getParentRoute: () => locationRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): { window?: ObservationWindow } => ({
    window: OBSERVATION_WINDOWS.some((w) => w.value === search.window)
      ? (search.window as ObservationWindow)
      : undefined,
  }),
  component: lazyRouteComponent(() => import('./pages/Now'), 'NowPage'),
})

export const forecastRoute = createRoute({
  getParentRoute: () => locationRoute,
  path: 'forecast',
  component: lazyRouteComponent(() => import('./pages/Forecast'), 'ForecastPage'),
})

export const airQualityRoute = createRoute({
  getParentRoute: () => locationRoute,
  path: 'air-quality',
  component: lazyRouteComponent(() => import('./pages/AirQuality'), 'AirQualityPage'),
})

export const historyRoute = createRoute({
  getParentRoute: () => locationRoute,
  path: 'history',
  validateSearch: (search: Record<string, unknown>): { period?: HistoryPeriod } => ({
    period: HISTORY_PERIODS.some((p) => p.value === search.period)
      ? (search.period as HistoryPeriod)
      : undefined,
  }),
  component: lazyRouteComponent(() => import('./pages/History'), 'HistoryPage'),
})

const manageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'manage',
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQuery())
    if (!session.is_admin) throw redirect({ to: '/sign-in', search: { redirect: '/manage' } })
  },
  component: lazyRouteComponent(() => import('./pages/Manage'), 'ManagePage'),
})

export const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'sign-in',
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    // Only allow in-app paths to avoid open redirects.
    redirect:
      typeof search.redirect === 'string' &&
      search.redirect.startsWith('/') &&
      !search.redirect.startsWith('//')
        ? search.redirect
        : undefined,
  }),
  component: lazyRouteComponent(() => import('./pages/SignIn'), 'SignInPage'),
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  locationRoute.addChildren([nowRoute, forecastRoute, airQualityRoute, historyRoute]),
  manageRoute,
  signInRoute,
])

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: 'intent',
    // Data freshness is handled by TanStack Query.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
