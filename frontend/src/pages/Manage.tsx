import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'

import { api, type CollectionRun, type GeocodeResult, type Location } from '../api/client'
import { latestRunQuery, locationsQuery, queryKeys, sessionQuery } from '../api/queries'
import { Notice } from '../components/States'
import { errorText } from '../lib/errors'

function useCollection() {
  const queryClient = useQueryClient()
  // When we last started a run; polls the latest run until one that began after it finishes.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const isFinished = (run: CollectionRun | null | undefined) =>
    startedAt !== null && run?.finished_at != null && Date.parse(run.started_at) >= startedAt - 5000
  const run = useQuery({
    ...latestRunQuery(),
    refetchInterval: (query) =>
      startedAt !== null && !isFinished(query.state.data) ? 2000 : false,
  })
  const finished = isFinished(run.data)
  const running = startedAt !== null && !finished

  useEffect(() => {
    // New observations, forecasts and history for every location.
    if (finished) void queryClient.invalidateQueries({ queryKey: queryKeys.locations })
  }, [finished, queryClient])

  const start = useMutation({
    mutationFn: (locationIds?: number[]) => api.collect(locationIds),
    onMutate: () => setStartedAt(Date.now()),
    onError: () => setStartedAt(null),
  })

  return { start, running, latest: run.data }
}

const manageRoute = getRouteApi('/manage')

function SearchLocations({
  disabled,
  tracked,
}: {
  disabled: boolean
  tracked: readonly Location[]
}) {
  const queryClient = useQueryClient()
  // Arriving from the header search with ?q= starts the search straight away.
  const { q = '' } = manageRoute.useSearch()
  const [query, setQuery] = useState(q)
  const [submitted, setSubmitted] = useState(disabled ? '' : q)
  const results = useQuery({
    queryKey: ['geocode', submitted],
    queryFn: () => api.geocode(submitted),
    enabled: submitted.length > 0,
    staleTime: Infinity,
  })
  const track = useMutation({
    mutationFn: (place: GeocodeResult) =>
      api.createLocation({
        name: place.name,
        state: place.state,
        country: place.country,
        lat: place.lat,
        lon: place.lon,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.locations }),
  })

  const isTracked = (place: GeocodeResult) =>
    tracked.some(
      (loc) => Math.abs(loc.lat - place.lat) < 1e-3 && Math.abs(loc.lon - place.lon) < 1e-3,
    )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(query.trim())
  }

  return (
    <section className="card stack">
      <h2>Add a location</h2>
      <form className="form-row" onSubmit={submit} role="search">
        <div className="field" style={{ flex: '1 1 240px' }}>
          <label htmlFor="city">City</label>
          <input
            id="city"
            type="search"
            placeholder="e.g. Toronto or Paris, FR"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled}
          />
        </div>
        <button type="submit" className="button" disabled={disabled || !query.trim()}>
          Search
        </button>
      </form>
      {results.isFetching ? <p className="caption">Searching…</p> : null}
      {results.error ? <p className="error">{errorText(results.error)}</p> : null}
      {results.data?.length === 0 ? <p className="caption">No matches found.</p> : null}
      {results.data?.length ? (
        <ul className="list" aria-label="Search results">
          {results.data.map((place) => (
            <li key={`${place.lat},${place.lon}`}>
              <span>
                {place.display_name}{' '}
                <span className="caption">
                  {place.lat.toFixed(2)}, {place.lon.toFixed(2)}
                </span>
              </span>
              {isTracked(place) ? (
                <span className="caption">Tracked</span>
              ) : (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => track.mutate(place)}
                  disabled={track.isPending}
                >
                  Track
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {track.error ? <p className="error">{errorText(track.error)}</p> : null}
      {track.data ? (
        <p className="caption" role="status">
          Now tracking {track.data.display_name}. Its data is being collected and history
          backfilled;{' '}
          <Link to="/locations/$locationId" params={{ locationId: track.data.id }}>
            view it
          </Link>
          .
        </p>
      ) : null}
    </section>
  )
}

function TrackedLocations({ locations }: { locations: readonly Location[] }) {
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState<number | null>(null)
  const remove = useMutation({
    mutationFn: api.deleteLocation,
    onSuccess: () => {
      setConfirming(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.locations })
    },
  })

  return (
    <section className="card stack">
      <h2>Tracked locations</h2>
      {locations.length === 0 ? (
        <p className="caption">None yet.</p>
      ) : (
        <ul className="list">
          {locations.map((location) => (
            <li key={location.id}>
              <Link to="/locations/$locationId" params={{ locationId: location.id }}>
                {location.display_name}
              </Link>
              {confirming === location.id ? (
                <span className="form-row">
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => remove.mutate(location.id)}
                    disabled={remove.isPending}
                  >
                    Remove and delete its data
                  </button>
                  <button type="button" className="button" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" className="button" onClick={() => setConfirming(location.id)}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.error ? <p className="error">{errorText(remove.error)}</p> : null}
    </section>
  )
}

export function ManagePage() {
  const { data: session } = useQuery(sessionQuery())
  const { data: locations = [] } = useQuery(locationsQuery())
  const collection = useCollection()
  const canCollect = session?.can_collect ?? false

  return (
    <div className="stack">
      <h1>Manage locations</h1>
      {!canCollect ? (
        <Notice tone="error">
          No <code>WEATHER_API_KEY</code> is configured on the server, so locations can’t be
          searched or collected.
        </Notice>
      ) : null}
      <SearchLocations disabled={!canCollect} tracked={locations} />
      <TrackedLocations locations={locations} />
      <section className="card stack">
        <h2>Collection</h2>
        <p className="caption" style={{ margin: 0 }}>
          The scheduler collects every location automatically. Run it now to refresh immediately.
        </p>
        <div className="form-row" style={{ alignItems: 'center' }}>
          <button
            type="button"
            className="button button-primary"
            onClick={() => collection.start.mutate(undefined)}
            disabled={!canCollect || collection.running || locations.length === 0}
          >
            {collection.running ? 'Collecting…' : 'Collect now'}
          </button>
          {collection.latest ? (
            <span className="caption" role="status">
              Last run {new Date(collection.latest.started_at).toLocaleString()}:{' '}
              {collection.latest.status}, {collection.latest.locations_processed} location
              {collection.latest.locations_processed === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {collection.start.error ? (
          <p className="error">{errorText(collection.start.error)}</p>
        ) : null}
        {collection.latest?.errors ? (
          <pre className="caption" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {collection.latest.errors}
          </pre>
        ) : null}
      </section>
    </div>
  )
}
