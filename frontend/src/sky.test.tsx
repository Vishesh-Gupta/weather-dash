import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockApi, renderApp } from './test/app'
import { adminSession, observation, overviewItem, toronto } from './test/fixtures'

const paris = {
  ...toronto,
  id: 2,
  name: 'Paris',
  state: null,
  country: 'FR',
  display_name: 'Paris, FR',
  utc_offset_seconds: 7200,
}
const rainyParis = {
  ...overviewItem({
    ...observation(),
    weather_main: 'Rain',
    weather_description: 'moderate rain',
    weather_icon: '10d',
  }),
  location: paris,
}

beforeEach(() => {
  window.localStorage.clear()
  // Midday in Toronto on the fixture date: sunrise 11:24 UTC, sunset 22:15 UTC.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T16:50:00Z') })
})

afterEach(() => {
  vi.useRealTimers()
})

function routesWithParis() {
  return {
    'GET /api/overview': [overviewItem(), rainyParis],
    'GET /api/locations': [toronto, paris],
    'GET /api/locations/2': paris,
    'GET /api/locations/2/current': rainyParis.current,
  }
}

describe('the page is the sky', () => {
  it("takes the viewed location's sky and remembers it", async () => {
    mockApi(routesWithParis())
    const { container, router } = renderApp('/locations/2')
    await screen.findByRole('region', { name: /Current weather in Paris/ })
    await waitFor(() => expect(container.querySelector('.app')).toHaveClass('sky-rain'))

    // The overview keeps the last location's sky.
    await router.navigate({ to: '/' })
    await screen.findByRole('heading', { name: 'Weather now' })
    expect(container.querySelector('.app')).toHaveClass('sky-rain')
    expect(window.localStorage.getItem('last-location')).toBe('2')
  })

  it('draws the sun on its arc with sunrise, sunset and day length', async () => {
    mockApi()
    renderApp('/locations/1')
    const hero = await screen.findByRole('region', { name: /Current weather/ })
    expect(within(hero).getByText('Daylight 10 h 51 min')).toBeInTheDocument()
    expect(within(hero).getByText(/Sunset in 5 h 2\d min/)).toBeInTheDocument()
    const sun = hero.querySelector<HTMLElement>('.sun-arc-sun')!
    expect(parseFloat(sun.style.left)).toBeGreaterThan(45)
    expect(parseFloat(sun.style.left)).toBeLessThan(55)
  })

  it('switches to the moon and the night arc after sunset', async () => {
    vi.setSystemTime(new Date('2026-10-22T03:00:00Z'))
    mockApi()
    renderApp('/locations/1')
    const hero = await screen.findByRole('region', { name: /Current weather/ })
    expect(within(hero).getByText(/Sunrise in/)).toBeInTheDocument()
    expect(hero.querySelector('.sun-arc-moon')).not.toBeNull()
    expect(hero.querySelector('.sun-arc-sun')).toBeNull()
  })
})

describe('switching locations', () => {
  it('lists every location one click away', async () => {
    mockApi(routesWithParis())
    const { router } = renderApp('/locations/1')
    const nav = await screen.findByRole('navigation', { name: 'Locations' })
    const pill = await within(nav).findByRole('link', { name: /Paris/ })
    expect(within(nav).getByRole('link', { name: /Toronto/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(pill)
    await waitFor(() => expect(router.state.location.pathname).toBe('/locations/2'))
  })

  it('finds locations by search and keyboard', async () => {
    mockApi(routesWithParis())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { router } = renderApp('/locations/1')
    const search = await screen.findByRole('combobox', { name: 'Search locations' })
    await user.type(search, 'par')
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Paris, FR'])
    await user.keyboard('{Enter}')
    await waitFor(() => expect(router.state.location.pathname).toBe('/locations/2'))
  })

  it('offers admins a shortcut to add an untracked place', async () => {
    mockApi({ ...routesWithParis(), 'GET /api/session': adminSession, 'GET /api/geocode': [] })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { router } = renderApp('/locations/1')
    await user.type(await screen.findByRole('combobox', { name: 'Search locations' }), 'Lisbon')
    await user.click(screen.getByRole('option', { name: /Add “Lisbon” as a new location/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/manage'))
    expect(router.state.location.search).toEqual({ q: 'Lisbon' })
    expect(await screen.findByLabelText('City')).toHaveValue('Lisbon')
  })

  it("doesn't offer visitors the add shortcut", async () => {
    mockApi(routesWithParis())
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderApp('/locations/1')
    await user.type(await screen.findByRole('combobox', { name: 'Search locations' }), 'Lisbon')
    expect(screen.queryByRole('option', { name: /Add/ })).toBeNull()
    expect(screen.getByText(/No tracked location matches/)).toBeInTheDocument()
  })
})
