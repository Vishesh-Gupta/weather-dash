import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useParams } from '@tanstack/react-router'
import { useMemo } from 'react'

import { api } from '../api/client'
import { latestRunQuery, queryKeys, sessionQuery } from '../api/queries'
import { useInstallPrompt, useOnline } from '../lib/app'
import { sceneFor } from '../lib/scene'
import { skyStyle } from '../lib/skyStyle'
import { useActiveLocation } from '../lib/useActiveLocation'
import { useNow } from '../lib/useNow'
import { usePreferences } from '../preferences-context'
import { LiveBadge } from './LiveBadge'
import { LocationSwitcher } from './LocationSwitcher'
import { Segmented } from './Segmented'
import { SkyBackdrop } from './SkyBackdrop'

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

function InstallButton() {
  const install = useInstallPrompt()
  if (!install) return null
  return (
    <button type="button" className="button" onClick={() => void install()}>
      Install app
    </button>
  )
}

function OfflineNotice() {
  const online = useOnline()
  if (online) return null
  return (
    <p className="offline-notice" role="status">
      <strong>You&apos;re offline.</strong> Showing what this device saved last; it updates when
      you&apos;re back online.
    </p>
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

function useActiveScene() {
  const { items, active } = useActiveLocation()
  // Re-evaluated each minute so the sun and moon keep moving across the sky.
  const now = useNow(60_000)
  const scene = useMemo(
    () => (active?.current ? sceneFor(active.current, active.location, now) : null),
    [active, now],
  )
  return { items, active, scene }
}

export function Layout() {
  const { units, setUnitSystem } = usePreferences()
  const { items, scene } = useActiveScene()
  // The sky follows the last location visited, but only a location page is "current".
  const { locationId } = useParams({ strict: false })

  return (
    <div className="app" style={scene ? skyStyle(scene.palette) : undefined}>
      <SkyBackdrop scene={scene} />
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" />
          Weather Analytics
        </Link>
        <nav className="toolbar" aria-label="Display options">
          <LiveBadge />
          <Segmented
            label="Units"
            value={units.system}
            onChange={setUnitSystem}
            options={[
              { value: 'metric', label: '°C' },
              { value: 'imperial', label: '°F' },
            ]}
          />
          <InstallButton />
          <SessionControls />
        </nav>
      </header>
      <LocationSwitcher items={items} activeId={locationId} />
      <main className="main" id="main">
        <OfflineNotice />
        <Outlet />
      </main>
      <footer className="footer">
        <CollectionStatus /> · Current weather, forecasts and air quality from{' '}
        <a href="https://openweathermap.org/">OpenWeather</a>. Hourly forecast and history from{' '}
        <a href="https://open-meteo.com/">Open-Meteo</a> (CC BY 4.0).
      </footer>
    </div>
  )
}
