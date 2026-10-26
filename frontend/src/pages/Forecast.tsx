import { Chart } from '@tanstack/charts/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { forecastQuery } from '../api/queries'
import {
  precipitationAmountChart,
  precipitationChanceChart,
  temperatureChart,
  type PrecipRow,
  type TempRow,
} from '../charts/definitions'
import { ChartCard } from '../components/ChartCard'
import { DataTable } from '../components/DataTable'
import { columnHelper } from '../components/table'
import { ErrorNotice, Loading, Notice } from '../components/States'
import { useLocation } from '../lib/useLocation'
import { formatDayTime, formatWeekday, toLocationTime } from '../lib/time'
import { forecastByDay, type ForecastDay } from '../lib/transform'
import type { Units } from '../lib/units'
import { usePreferences } from '../preferences-context'

const helper = columnHelper<ForecastDay>()

function summaryColumns(units: Units) {
  const digits = units.system === 'metric' ? 1 : 2
  return helper.columns([
    helper.accessor('date', {
      header: 'Day',
      cell: (info) => formatWeekday(info.getValue()),
      enableSorting: false,
    }),
    helper.accessor('low', {
      header: `Low (${units.tempLabel})`,
      cell: (info) => units.temp(info.getValue()).toFixed(1),
    }),
    helper.accessor('high', {
      header: `High (${units.tempLabel})`,
      cell: (info) => units.temp(info.getValue()).toFixed(1),
    }),
    helper.accessor('maxChance', {
      header: 'Chance of precipitation',
      cell: (info) => `${Math.round(info.getValue() * 100)}%`,
    }),
    helper.accessor('precipitation', {
      header: `Precipitation (${units.precipLabel})`,
      cell: (info) => units.precip(info.getValue()).toFixed(digits),
    }),
    helper.accessor('conditions', { header: 'Conditions', enableSorting: false }),
  ])
}

export function ForecastPage() {
  const location = useLocation()
  const { units, palette } = usePreferences()
  const { data, isPending, error, refetch } = useQuery(forecastQuery(location.id))
  const offset = location.utc_offset_seconds

  const view = useMemo(() => {
    if (!data || data.entries.length === 0) return null
    const entries = data.entries
    const time = (iso: string) => toLocationTime(iso, offset)
    const tempRows: TempRow[] = entries.flatMap((e) => [
      { time: time(e.forecast_for), series: 'Temperature' as const, value: units.temp(e.temp) },
      {
        time: time(e.forecast_for),
        series: 'Feels like' as const,
        value: units.temp(e.feels_like ?? e.temp),
      },
    ])
    const precipRows: PrecipRow[] = entries.flatMap((e) => [
      { time: time(e.forecast_for), kind: 'Rain' as const, amount: units.precip(e.rain_3h ?? 0) },
      { time: time(e.forecast_for), kind: 'Snow' as const, amount: units.precip(e.snow_3h ?? 0) },
    ])
    const spanHours =
      (Date.parse(entries.at(-1)!.forecast_for) - Date.parse(entries[0]!.forecast_for)) / 3.6e6
    return {
      days: forecastByDay(entries, offset),
      columns: summaryColumns(units),
      temperature: temperatureChart(tempRows, { unit: units.tempLabel, palette, spanHours }),
      chance: precipitationChanceChart(
        entries.map((e) => ({ time: time(e.forecast_for), chance: (e.pop ?? 0) * 100 })),
        palette,
      ),
      amount: precipitationAmountChart(precipRows, { unit: units.precipLabel, palette }),
    }
  }, [data, offset, units, palette])

  if (isPending) return <Loading height={360} />
  if (error) return <ErrorNotice error={error} onRetry={() => void refetch()} />
  if (!data.issued_at || !view) return <Notice>No forecast has been collected yet.</Notice>

  return (
    <div className="stack">
      <p className="caption on-sky" style={{ margin: 0 }}>
        5-day forecast in 3-hour steps, retrieved{' '}
        {formatDayTime(toLocationTime(data.issued_at, offset))} local time.
      </p>
      <section className="card">
        <h2>Daily summary</h2>
        <DataTable data={view.days} columns={view.columns} caption="Forecast summary by day" />
      </section>
      <ChartCard title="Temperature">
        <Chart
          definition={view.temperature}
          height={300}
          className="chart"
          ariaLabel="Forecast temperature and feels-like temperature for the next five days"
        />
      </ChartCard>
      <div className="grid-2">
        <ChartCard title="Chance of precipitation" description="Per 3-hour period.">
          <Chart
            definition={view.chance}
            height={220}
            className="chart"
            ariaLabel="Forecast chance of precipitation"
          />
        </ChartCard>
        <ChartCard
          title="Expected precipitation"
          description={`${units.precipLabel} per 3-hour period.`}
        >
          <Chart
            definition={view.amount}
            height={220}
            className="chart"
            ariaLabel="Forecast rain and snow amounts"
          />
        </ChartCard>
      </div>
    </div>
  )
}
