import { getRouteApi, Link, Outlet } from '@tanstack/react-router'

import { useLocation } from '../lib/useLocation'
import { formatUtcOffset } from '../lib/time'

const TABS = [
  { to: '/locations/$locationId', label: 'Now', exact: true },
  { to: '/locations/$locationId/forecast', label: 'Forecast', exact: false },
  { to: '/locations/$locationId/radar', label: 'Radar', exact: false },
  { to: '/locations/$locationId/air-quality', label: 'Air quality', exact: false },
  { to: '/locations/$locationId/history', label: 'History', exact: false },
] as const

const locationRoute = getRouteApi('/locations/$locationId')

export function LocationLayout() {
  const location = useLocation()
  const { locationId } = locationRoute.useParams()

  return (
    <>
      <div className="page-header">
        <h1>{location.display_name}</h1>
        <span className="caption">
          Local time {formatUtcOffset(location.utc_offset_seconds)} · {location.lat.toFixed(2)},{' '}
          {location.lon.toFixed(2)}
        </span>
      </div>
      <nav className="tabs" aria-label="Views">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ locationId }}
            activeOptions={{ exact: tab.exact }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
