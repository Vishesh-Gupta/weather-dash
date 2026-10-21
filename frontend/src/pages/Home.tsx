import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { overviewQuery, sessionQuery } from '../api/queries'
import { LocationCard } from '../components/Hero'
import { ErrorNotice, Loading, Notice } from '../components/States'
import { aqiLevel } from '../lib/aqi'
import { usePreferences } from '../preferences-context'

function EmptyState() {
  const { data: session } = useQuery(sessionQuery())
  if (!session?.is_admin)
    return <Notice>No locations have been published yet. Check back soon.</Notice>
  if (!session.can_collect) {
    return (
      <Notice tone="error">
        No <code>WEATHER_API_KEY</code> is configured on the server. Add one to your{' '}
        <code>.env</code> file (<a href="https://openweathermap.org/api">get a free key</a>) and
        restart the API.
      </Notice>
    )
  }
  return (
    <Notice>
      No locations are tracked yet. <Link to="/manage">Add your first location</Link>.
    </Notice>
  )
}

export function HomePage() {
  const { units } = usePreferences()
  const { data: items, isPending, error, refetch } = useQuery(overviewQuery())

  return (
    <div className="stack">
      <div>
        <h1>Weather now</h1>
        <p className="subtle" style={{ margin: '4px 0 0' }}>
          Live conditions for every tracked location. Values update on their own as new readings
          arrive.
        </p>
      </div>
      {isPending ? (
        <Loading height={200} />
      ) : error ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="cards">
          {items.map((item) => (
            <LocationCard
              key={item.location.id}
              location={item.location}
              obs={item.current}
              units={units}
              today={item.today}
              aqi={item.air_quality ? aqiLevel(item.air_quality.aqi) : null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
