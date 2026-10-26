import { Chart } from '@tanstack/charts/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { airQualityQuery } from '../api/queries'
import { particulateChart, pollutantChart, type ParticulateRow } from '../charts/definitions'
import { ChartCard } from '../components/ChartCard'
import { ErrorNotice, Loading, Notice } from '../components/States'
import { useLocation } from '../lib/useLocation'
import { aqiLevel, POLLUTANTS } from '../lib/aqi'
import { formatDayTime, toLocationTime } from '../lib/time'
import { usePreferences } from '../preferences-context'

// Shape plus label, so the level never depends on color alone.
const ICONS = { good: '●', warning: '▲', serious: '▲', critical: '■' } as const

export function AqiStatus({ aqi }: { aqi: number }) {
  const level = aqiLevel(aqi)
  return (
    <div className={level.role ? `status status-${level.role}` : 'status'}>
      <span className="status-icon" aria-hidden="true">
        {level.role ? ICONS[level.role] : '○'}
      </span>
      {level.label}
      <span className="caption" style={{ fontWeight: 400 }}>
        AQI {aqi} of 5
      </span>
    </div>
  )
}

export function AirQualityPage() {
  const location = useLocation()
  const { palette } = usePreferences()
  const { data, isPending, error, refetch } = useQuery(airQualityQuery(location.id, 7))
  const offset = location.utc_offset_seconds

  const view = useMemo(() => {
    const latest = data?.at(-1)
    if (!data || !latest) return null
    const trendRows: ParticulateRow[] = data.flatMap((r) => {
      const time = toLocationTime(r.observed_at, offset)
      return [
        ...(r.pm2_5 == null ? [] : [{ time, pollutant: 'PM2.5' as const, value: r.pm2_5 }]),
        ...(r.pm10 == null ? [] : [{ time, pollutant: 'PM10' as const, value: r.pm10 }]),
      ]
    })
    const breakdown = POLLUTANTS.flatMap(({ key, label }) => {
      const value = latest[key]
      return value == null ? [] : [{ label, value }]
    })
    return {
      latest,
      breakdown: pollutantChart(breakdown, palette),
      breakdownRows: breakdown,
      trend: data.length >= 2 ? particulateChart(trendRows, palette) : null,
    }
  }, [data, offset, palette])

  if (isPending) return <Loading height={320} />
  if (error) return <ErrorNotice error={error} onRetry={() => void refetch()} />
  if (!view) return <Notice>No air quality readings have been collected yet.</Notice>

  return (
    <div className="stack">
      <section className="card" aria-label="Current air quality">
        <AqiStatus aqi={view.latest.aqi} />
        <p className="caption" style={{ margin: '4px 0 0' }}>
          Measured {formatDayTime(toLocationTime(view.latest.observed_at, offset))} local time ·
          OpenWeather 1–5 index
        </p>
      </section>
      <div className="grid-2">
        <ChartCard
          title="Pollutant concentrations"
          description="Latest reading, µg/m³ on a log scale."
        >
          <Chart
            definition={view.breakdown}
            height={280}
            className="chart"
            ariaLabel="Latest pollutant concentrations"
            ariaDescription={view.breakdownRows
              .map((r) => `${r.label} ${r.value.toFixed(1)}`)
              .join(', ')}
          />
        </ChartCard>
        <ChartCard title="Particulates" description="PM2.5 and PM10 over the last 7 days.">
          {view.trend ? (
            <Chart
              definition={view.trend}
              height={280}
              className="chart"
              ariaLabel="PM2.5 and PM10 concentrations over the last seven days"
            />
          ) : (
            <p className="caption">The trend appears once a few readings have been collected.</p>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
