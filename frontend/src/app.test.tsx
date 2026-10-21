import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { mockApi, renderApp } from './test/app'
import { adminSession, toronto } from './test/fixtures'

beforeEach(() => {
  window.localStorage.clear()
})

describe('visitor views', () => {
  it('shows every location as a live card on the home page', async () => {
    mockApi()
    const { router } = renderApp('/')
    const card = await screen.findByRole('link', { name: /Toronto/ })
    expect(within(card).getByText('17°')).toBeInTheDocument()
    expect(within(card).getByText('H 19° · L 8°')).toBeInTheDocument()
    expect(within(card).getByText('Air fair')).toBeInTheDocument()
    expect(within(card).getByRole('img', { name: 'Partly cloudy' })).toBeInTheDocument()

    await userEvent.click(card)
    await waitFor(() => expect(router.state.location.pathname).toBe('/locations/1'))
  })

  it('shows current conditions in local time and switches units', async () => {
    mockApi()
    renderApp('/locations/1')
    const hero = await screen.findByRole('region', {
      name: 'Current weather in Toronto, Ontario, CA',
    })
    expect(within(hero).getByText('17°')).toBeInTheDocument()
    expect(within(hero).getByText('Feels like 16°C')).toBeInTheDocument()
    expect(within(hero).getByText(/Observed 10:00/)).toBeInTheDocument()
    expect(within(hero).getByText('Sunrise 07:24')).toBeInTheDocument()
    expect(screen.getByText('16 km/h WSW')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /Observed temperature/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '°F' }))
    expect(within(hero).getByText('63°')).toBeInTheDocument()
    expect(within(hero).getByText('Feels like 60°F')).toBeInTheDocument()
    expect(screen.getByText('10 mph WSW')).toBeInTheDocument()
    expect(window.localStorage.getItem('units')).toBe('imperial')
  })

  it('remembers the unit preference', async () => {
    window.localStorage.setItem('units', 'imperial')
    mockApi()
    renderApp('/locations/1')
    expect(await screen.findByText('Feels like 60°F')).toBeInTheDocument()
  })

  it('requests the selected observation window', async () => {
    const { calls } = mockApi()
    renderApp('/locations/1')
    await screen.findByText('Feels like 16°C')
    await userEvent.click(screen.getByRole('button', { name: '24 hours' }))
    await waitFor(() =>
      expect(calls.some((c) => c.path === '/api/locations/1/observations?days=1')).toBe(true),
    )
  })

  it('summarises the forecast by local day', async () => {
    mockApi()
    renderApp('/locations/1/forecast')
    const table = await screen.findByRole('table', { name: 'Forecast summary by day' })
    const rows = within(table).getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)
    expect(within(table).getByText('80%')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: /Forecast chance of precipitation/ }),
    ).toBeInTheDocument()
  })

  it('sorts the forecast table', async () => {
    mockApi()
    renderApp('/locations/1/forecast')
    const table = await screen.findByRole('table', { name: 'Forecast summary by day' })
    const header = within(table).getByRole('button', { name: /High/ })
    await userEvent.click(header)
    expect(within(table).getByRole('columnheader', { name: /High/ })).toHaveAttribute('aria-sort')
  })

  it('labels air quality with text, not just color', async () => {
    mockApi()
    renderApp('/locations/1/air-quality')
    expect(await screen.findByText('Fair')).toBeInTheDocument()
    expect(screen.getByText('AQI 2 of 5')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Latest pollutant concentrations' })).toBeInTheDocument()
  })

  it('filters history by period and keeps it in the URL', async () => {
    mockApi()
    const { router } = renderApp('/locations/1/history')
    expect(await screen.findByText('Warmest day')).toBeInTheDocument()
    expect(screen.getByText(/to 20 Oct 2026/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '30 days' }))
    await waitFor(() => expect(router.state.location.search).toEqual({ period: '30d' }))
    expect(screen.getByText(/21 Sept 2026 to 20 Oct 2026/)).toBeInTheDocument()
  })

  it('shows not found for unknown locations', async () => {
    mockApi()
    renderApp('/locations/42')
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeInTheDocument()
  })

  it('shows an empty state when nothing is published', async () => {
    mockApi({ 'GET /api/overview': [] })
    renderApp('/')
    expect(await screen.findByText(/No locations have been published yet/)).toBeInTheDocument()
  })

  it('reports API failures with a retry', async () => {
    mockApi({
      'GET /api/locations/1/current': () => {
        throw { status: 500, detail: 'Database unavailable' }
      },
    })
    renderApp('/locations/1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('admin', () => {
  it('sends visitors who open /manage to sign in', async () => {
    mockApi()
    const { router } = renderApp('/manage')
    expect(await screen.findByRole('heading', { name: 'Admin sign-in' })).toBeInTheDocument()
    expect(router.state.location.search).toEqual({ redirect: '/manage' })
  })

  it('rejects a wrong password and signs in with the right one', async () => {
    let session = { is_admin: false, auth_required: true, can_collect: true }
    mockApi({
      'GET /api/session': () => session,
      'POST /api/session': ({ body }: { body: unknown }) => {
        if ((body as { password: string }).password !== 'secret')
          throw { status: 401, detail: 'Incorrect password' }
        session = adminSession
        return session
      },
    })
    const { router } = renderApp('/sign-in')
    const password = await screen.findByLabelText('Password')

    await userEvent.type(password, 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password')

    await userEvent.type(screen.getByLabelText('Password'), 'secret')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Manage locations' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/manage')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('ignores off-site redirect targets after sign-in', async () => {
    mockApi({ 'POST /api/session': adminSession })
    const { router } = renderApp('/sign-in?redirect=%2F%2Fevil.example')
    await userEvent.type(await screen.findByLabelText('Password'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/manage'))
  })

  it('searches, tracks and removes locations', async () => {
    let locations = [toronto]
    const paris = {
      ...toronto,
      id: 2,
      name: 'Paris',
      state: null,
      country: 'FR',
      display_name: 'Paris, FR',
      lat: 48.85,
      lon: 2.35,
    }
    const { calls } = mockApi({
      'GET /api/session': adminSession,
      'GET /api/locations': () => locations,
      'GET /api/geocode': [
        {
          name: 'Paris',
          state: null,
          country: 'FR',
          lat: 48.85,
          lon: 2.35,
          display_name: 'Paris, FR',
        },
        {
          name: 'Toronto',
          state: 'Ontario',
          country: 'CA',
          lat: 43.6535,
          lon: -79.3839,
          display_name: 'Toronto, Ontario, CA',
        },
      ],
      'POST /api/locations': () => {
        locations = [...locations, paris]
        return paris
      },
      'DELETE /api/locations/1': () => {
        locations = locations.filter((l) => l.id !== 1)
        return null
      },
    })
    renderApp('/manage')

    await userEvent.type(await screen.findByLabelText('City'), 'Paris')
    await userEvent.click(screen.getByRole('button', { name: 'Search' }))
    const results = await screen.findByRole('list', { name: 'Search results' })
    // Already-tracked places can't be added twice.
    expect(within(results).getByText('Tracked')).toBeInTheDocument()

    await userEvent.click(within(results).getByRole('button', { name: 'Track' }))
    expect(await screen.findByText(/Now tracking Paris, FR/)).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST' && c.path === '/api/locations')?.body).toEqual({
      name: 'Paris',
      state: null,
      country: 'FR',
      lat: 48.85,
      lon: 2.35,
    })

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!)
    await userEvent.click(screen.getByRole('button', { name: 'Remove and delete its data' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Toronto, Ontario, CA' })).not.toBeInTheDocument(),
    )
  })

  it('explains when the server has no API key', async () => {
    mockApi({ 'GET /api/session': { ...adminSession, can_collect: false } })
    renderApp('/manage')
    expect(await screen.findByText(/WEATHER_API_KEY/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collect now' })).toBeDisabled()
  })

  it('starts a collection', async () => {
    const { calls } = mockApi({
      'GET /api/session': adminSession,
      'POST /api/collection-runs': { status: 'started' },
    })
    renderApp('/manage')
    await userEvent.click(await screen.findByRole('button', { name: 'Collect now' }))
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.path === '/api/collection-runs')).toBe(
        true,
      ),
    )
  })
})
