import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router'

import { api } from '../api/client'
import { latestRunQuery, locationsQuery, queryKeys, sessionQuery } from '../api/queries'
import { usePreferences, type ThemePreference } from '../preferences-context'
import { Segmented } from './Segmented'

const LOCATION_TABS = ['', 'forecast', 'air-quality', 'history'] as const

function LocationPicker() {
  const { data: locations = [] } = useQuery(locationsQuery())
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const match = matchRoute({ to: '/locations/$locationId', fuzzy: true })
  const currentId = match ? Number(match.locationId) : undefined

  if (locations.length === 0) return null

  // Keep the current tab when switching location.
  const currentTab = LOCATION_TABS.find(
    (tab) => tab && matchRoute({ to: `/locations/$locationId/${tab}`, fuzzy: true }),
  )

  return (
    <label>
      <span className="visually-hidden">Location</span>
      <select
        value={currentId ?? ''}
        onChange={(event) => {
          const locationId = Number(event.target.value)
          void navigate({
            to: currentTab ? `/locations/$locationId/${currentTab}` : '/locations/$locationId',
            params: { locationId },
          })
        }}
      >
        {currentId === undefined ? <option value="">Choose a location</option> : null}
        {locations.map((location) => (
          <option key={location.id} value={location.id}>
            {location.display_name}
          </option>
        ))}
      </select>
    </label>
  )
}

function SessionControls() {
  const queryClient = useQueryClient()
  const { data: session } = useQuery(sessionQuery())
  const signOut = useMutation({
    mutationFn: api.signOut,
    onSuccess: (next) => queryClient.setQueryData(queryKeys.session, next),
  })

  if (!session) return null
  if (session.auth_required && !session.is_admin) {
    return (
      <Link to="/sign-in" className="button">
        Admin sign-in
      </Link>
    )
  }
  return (
    <>
      <Link to="/manage" className="button">
        Manage
      </Link>
      {session.auth_required ? (
        <button
          type="button"
          className="button"
          onClick={() => signOut.mutate()}
          disabled={signOut.isPending}
        >
          Sign out
        </button>
      ) : null}
    </>
  )
}

function CollectionStatus() {
  const { data: run } = useQuery(latestRunQuery())
  if (!run) return null
  const when = new Date(run.started_at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return (
    <span>
      Last updated {when}
      {run.status === 'success' ? '' : ` (${run.status})`}
    </span>
  )
}

export function Layout() {
  const { units, setUnitSystem, theme, setTheme } = usePreferences()

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" />
          Weather Analytics
        </Link>
        <nav className="toolbar" aria-label="Display options">
          <LocationPicker />
          <Segmented
            label="Units"
            value={units.system}
            onChange={setUnitSystem}
            options={[
              { value: 'metric', label: '°C' },
              { value: 'imperial', label: '°F' },
            ]}
          />
          <label>
            <span className="visually-hidden">Theme</span>
            <select
              value={theme}
              onChange={(event) => setTheme(event.target.value as ThemePreference)}
            >
              <option value="system">System theme</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <SessionControls />
        </nav>
      </header>
      <main className="main" id="main">
        <Outlet />
      </main>
      <footer className="footer">
        <CollectionStatus /> · Current weather, forecasts and air quality from{' '}
        <a href="https://openweathermap.org/">OpenWeather</a>. Historical data from{' '}
        <a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0).
      </footer>
    </div>
  )
}
