import { Chart } from '@tanstack/charts/react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import { currentQuery, observationsQuery, overviewQuery } from '../api/queries'
import { temperatureChart, type TempRow } from '../charts/definitions'
import { ChartCard } from '../components/ChartCard'
import { Hero } from '../components/Hero'
import { Segmented } from '../components/Segmented'
import { ErrorNotice, Loading, Notice } from '../components/States'
import { Tile } from '../components/Tile'
import { toLocationTime } from '../lib/time'
import { OBSERVATION_WINDOWS } from '../lib/periods'
import { compass } from '../lib/units'
import { usePreferences } from '../preferences-context'

const locationRoute = getRouteApi('/locations/$locationId')
const nowRoute = getRouteApi('/locations/$locationId/')

const dash = '–'

function ObservedTrend({ locationId, offset }: { locationId: number; offset: number | null }) {
  const { units, palette } = usePreferences()
  const navigate = useNavigate({ from: '/locations/$locationId/' })
  const { window = '7d' } = nowRoute.useSearch()
  const selected = OBSERVATION_WINDOWS.find((w) => w.value === window) ?? OBSERVATION_WINDOWS[1]
  const { data, isPending, error, refetch } = useQuery(observationsQuery(locationId, selected.days))

  const definition = useMemo(() => {
    if (!data || data.length < 2) return null
    const rows: TempRow[] = data.flatMap((o) => {
      const time = toLocationTime(o.observed_at, offset)
      return [
        { time, series: 'Temperature' as const, value: units.temp(o.temp) },
        { time, series: 'Feels like' as const, value: units.temp(o.feels_like) },
      ]
    })
    return temperatureChart(rows, { unit: units.tempLabel, palette, spanHours: selected.days * 24 })
  }, [data, offset, units, palette, selected.days])

  return (
    <ChartCard
      title="Observed temperature"
      description="Hourly readings collected by the scheduler, in local time."
    >
      <div style={{ marginBottom: 8 }}>
        <Segmented
          label="Time window"
          value={selected.value}
          options={OBSERVATION_WINDOWS}
          onChange={(value) => void navigate({ search: { window: value }, replace: true })}
        />
      </div>
      {isPending ? (
        <Loading height={300} />
      ) : error ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : definition ? (
        <Chart
          definition={definition}
          height={300}
          className="chart"
          ariaLabel={`Observed temperature and feels-like temperature over the last ${selected.label}`}
        />
      ) : (
        <p className="caption">The trend appears once a few observations have been collected.</p>
      )}
    </ChartCard>
  )
}

export function NowPage() {
  const location = locationRoute.useLoaderData()
  const { units } = usePreferences()
  const { data: obs, isPending, error, refetch } = useQuery(currentQuery(location.id))
  // Today's forecast range comes from the shared overview, already loaded for the home page.
  const { data: overview } = useQuery({
    ...overviewQuery(),
    select: (items) => items.find((item) => item.location.id === location.id),
  })
  const offset = location.utc_offset_seconds

  if (isPending) return <Loading height={240} />
  if (error) return <ErrorNotice error={error} onRetry={() => void refetch()} />
  if (!obs)
    return <Notice>No observations yet. They appear after the next scheduled collection.</Notice>

  const wind =
    obs.wind_speed == null
      ? dash
      : `${Math.round(units.wind(obs.wind_speed))} ${units.windLabel} ${compass(obs.wind_deg)}`.trim()

  return (
    <div className="stack">
      <Hero location={location} obs={obs} units={units} today={overview?.today} />
      <div className="tiles">
        <Tile
          label="Humidity"
          value={obs.humidity == null ? dash : `${Math.round(obs.humidity)}%`}
        />
        <Tile
          label="Wind"
          value={wind}
          detail={
            obs.wind_gust == null
              ? undefined
              : `Gusts ${Math.round(units.wind(obs.wind_gust))} ${units.windLabel}`
          }
        />
        <Tile
          label="Pressure"
          value={obs.pressure == null ? dash : `${Math.round(obs.pressure)} hPa`}
        />
        <Tile
          label="Cloud cover"
          value={obs.clouds == null ? dash : `${Math.round(obs.clouds)}%`}
        />
        <Tile
          label="Visibility"
          value={
            obs.visibility == null
              ? dash
              : `${units.distance(obs.visibility).toFixed(1)} ${units.distanceLabel}`
          }
        />
      </div>
      <ObservedTrend locationId={location.id} offset={offset} />
    </div>
  )
}
