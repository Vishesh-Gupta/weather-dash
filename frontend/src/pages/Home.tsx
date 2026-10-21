import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { sessionQuery } from '../api/queries'
import { Notice } from '../components/States'

/** Shown only when no locations are tracked; otherwise `/` redirects to the first one. */
export function HomePage() {
  const { data: session } = useQuery(sessionQuery())

  return (
    <div className="stack">
      <h1>Weather Analytics</h1>
      <p className="subtle">
        Current conditions, 5-day forecasts and air quality from OpenWeather, with years of daily
        history from the Open-Meteo archive.
      </p>
      {session?.is_admin ? (
        session.can_collect ? (
          <Notice>
            No locations are tracked yet. <Link to="/manage">Add your first location</Link>.
          </Notice>
        ) : (
          <Notice tone="error">
            No <code>WEATHER_API_KEY</code> is configured on the server. Add one to your{' '}
            <code>.env</code> file (<a href="https://openweathermap.org/api">get a free key</a>) and
            restart the API.
          </Notice>
        )
      ) : (
        <Notice>No locations have been published yet. Check back soon.</Notice>
      )}
    </div>
  )
}
