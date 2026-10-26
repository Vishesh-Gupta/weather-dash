import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockApi, renderApp } from './test/app'
import { adminSession, overviewItem, toronto } from './test/fixtures'

beforeEach(() => {
  window.localStorage.clear()
  // Fixture readings are from the morning of 21 October; tests run then unless they say otherwise.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T14:30:00Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('visitor views', () => {
  it('shows every location as a live card on the home page', async () => {
    mockApi()
    const { router } = renderApp('/')
    const main = await screen.findByRole('main')
    const card = await within(main).findByRole('link', { name: /Toronto/ })
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
    expect(within(hero).getByText('07:24')).toBeInTheDocument()
    expect(within(hero).getByText('18:15')).toBeInTheDocument()
    const wind = screen.getByRole('region', { name: 'Wind' })
    expect(wind).toHaveTextContent('16km/h')
    expect(wind).toHaveTextContent('Gentle breeze · from WSW')
    expect(await screen.findByRole('img', { name: /Observed temperature/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '°F' }))
    expect(within(hero).getByText('63°')).toBeInTheDocument()
    expect(within(hero).getByText('Feels like 60°F')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Wind' })).toHaveTextContent('10mph')
    expect(window.localStorage.getItem('units')).toBe('imperial')
  })

  it('explains each reading and shows the next 24 hours', async () => {
    mockApi({
      'GET /api/overview': [
        {
          ...overviewItem(),
          normal: {
            date: '2026-10-21',
            temp_max: 15.5,
            temp_min: 6,
            temp_mean: 10.5,
            precipitation: 2,
            wet_day_chance: 0.4,
            record_high: { date: '2019-10-20', value: 24.1 },
            record_low: { date: '2003-10-24', value: -2 },
            years: 5,
          },
        },
      ],
    })
    renderApp('/locations/1')
    const region = (name: string) => screen.findByRole('region', { name })

    // 65% at 17 °C: dew point 10 °C, comfortable.
    expect(await region('Humidity')).toHaveTextContent('Comfortable · dew point 10°')
    expect(await region('Pressure')).toHaveTextContent('Steady · ±0 hPa in 3 h')
    expect(await region('Cloud cover')).toHaveTextContent('Partly cloudy')
    expect(await region('Visibility')).toHaveTextContent('Excellent')
    expect(await region('Air quality')).toHaveTextContent('FairAQI 2 of 5 · PM2.5 9 µg/m³')
    // Today's forecast high 19° against a normal of 15.5°.
    const versus = await region('Versus normal')
    expect(versus).toHaveTextContent('+4°')
    expect(versus).toHaveTextContent('Warmer than usual today')
    expect(versus).toHaveTextContent('record 24° in 2019')

    const hours = await region('Next 24 hours')
    expect(within(hours).getAllByRole('listitem')).toHaveLength(8)
    expect(within(hours).getByText('80%')).toBeInTheDocument()
  })

  it('says plainly when readings have stopped updating', async () => {
    // Four days after the fixture readings, with a forecast issued the same day.
    vi.setSystemTime(new Date('2026-10-25T14:00:00Z'))
    mockApi()
    renderApp('/locations/1')
    const hero = await screen.findByRole('region', { name: /Current weather in Toronto/ })
    expect(
      within(hero)
        .getByText(/^Not updating/)
        .closest('p'),
    ).toHaveTextContent(
      'Not updating. No new readings since Wed 21 Oct, 10:00 local time (4 days ago)',
    )
    expect(hero).toHaveClass('is-stale')
    // The old forecast is no longer shown as the next 24 hours.
    expect(screen.queryByRole('region', { name: 'Next 24 hours' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Precipitation' })).toHaveTextContent(
      'No forecast for the next few hours',
    )
  })

  it('marks stale locations on the overview', async () => {
    vi.setSystemTime(new Date('2026-10-25T14:00:00Z'))
    mockApi()
    renderApp('/')
    const card = await screen.findByRole('link', { name: /Toronto.*Not updating/s })
    expect(card).toHaveClass('is-stale')
    // Days-old readings can't vouch for today's range.
    expect(within(card).queryByText(/^H \d/)).toBeNull()
  })

  it("doesn't flag fresh readings", async () => {
    mockApi()
    renderApp('/locations/1')
    const hero = await screen.findByRole('region', { name: /Current weather in Toronto/ })
    expect(hero).not.toHaveClass('is-stale')
    expect(within(hero).queryByText(/Not updating/)).toBeNull()
  })

  it('says when it is offline', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    mockApi()
    renderApp('/')
    expect(await screen.findByText(/Showing what this device saved last/)).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    online.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(screen.queryByText(/You're offline/)).toBeNull())
    online.mockRestore()
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
