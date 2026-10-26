import { Chart } from '@tanstack/charts/react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import {
  alertsQuery,
  currentQuery,
  forecastQuery,
  hourlyQuery,
  observationsQuery,
  overviewQuery,
} from '../api/queries'
import { temperatureChart, type TempRow } from '../charts/definitions'
import { Alerts } from '../components/Alerts'
import { ChartCard } from '../components/ChartCard'
import { Conditions } from '../components/Conditions'
import { Hero } from '../components/Hero'
import { NextHours } from '../components/NextHours'
import { Segmented } from '../components/Segmented'
import { ErrorNotice, Loading, Notice } from '../components/States'
import { useLocation } from '../lib/useLocation'
import {
  STALE_FORECAST_MS,
  STALE_HOURLY_MS,
  STALE_NOWCAST_MS,
  STALE_READING_MS,
  isStale,
} from '../lib/insights'
import { hourlySlots, threeHourlySlots } from '../lib/slots'
import { toLocationTime } from '../lib/time'
import { OBSERVATION_WINDOWS } from '../lib/periods'
import { useNow } from '../lib/useNow'
import { usePreferences } from '../preferences-context'

const nowRoute = getRouteApi('/locations/$locationId/')

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
  const location = useLocation()
  const { units } = usePreferences()
  const nowMs = useNow(60_000)
  const { data: obs, isPending, error, refetch } = useQuery(currentQuery(location.id))
  // The last day of readings drives the trend lines; refreshed live with the rest.
  const { data: recent = [] } = useQuery(observationsQuery(location.id, 1))
  const { data: forecast } = useQuery(forecastQuery(location.id))
  // A forecast issued days ago (collection stopped) is no forecast at all.
  const entries =
    forecast && !isStale(forecast.issued_at, nowMs, STALE_FORECAST_MS) ? forecast.entries : []
  // Open-Meteo's hourly forecast refreshes every 15 minutes; after a few hours without
  // an update it has stopped, and its nowcast with it.
  const { data: hourly } = useQuery(hourlyQuery(location.id))
  const { data: alerts = [] } = useQuery(alertsQuery(location.id))
  const fresh = hourly && !isStale(hourly.issued_at, nowMs, STALE_HOURLY_MS)
  const hours = fresh ? hourly.hours : []
  const nowcast = fresh && !isStale(hourly.issued_at, nowMs, STALE_NOWCAST_MS) ? hourly.nowcast : []
  const slots = hours.length ? hourlySlots(hours, nowMs) : threeHourlySlots(entries, nowMs)
  // Today's range, air quality and normal come from the shared overview.
  const { data: overview } = useQuery({
    ...overviewQuery(),
    select: (items) => items.find((item) => item.location.id === location.id),
  })
  const offset = location.utc_offset_seconds

  if (isPending) return <Loading height={240} />
  if (error) return <ErrorNotice error={error} onRetry={() => void refetch()} />
  if (!obs)
    return <Notice>No observations yet. They appear after the next scheduled collection.</Notice>
  // Today's range belongs to today; old readings can't be compared with it.
  const today = isStale(obs.observed_at, nowMs, STALE_READING_MS) ? null : overview?.today

  return (
    <div className="stack">
      <Alerts alerts={alerts} offset={offset} nowMs={nowMs} />
      <Hero location={location} obs={obs} units={units} today={today} />
      <NextHours
        slots={slots}
        title={hours.length ? 'Next 48 hours' : 'Next 24 hours'}
        source={hours.length ? 'Hour by hour' : 'Every 3 hours'}
        nowMs={nowMs}
        offset={offset}
        units={units}
      />
      <Conditions
        locationId={location.id}
        obs={obs}
        recent={recent}
        forecast={entries}
        hours={hours}
        nowcast={nowcast}
        air={overview?.air_quality ?? null}
        today={today ?? null}
        normal={overview?.normal ?? null}
        nowMs={nowMs}
        offset={offset}
        units={units}
      />
      <ObservedTrend locationId={location.id} offset={offset} />
    </div>
  )
}
