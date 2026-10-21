import { Chart } from '@tanstack/charts/react'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import type { DailyHistory } from '../api/client'
import { historyQuery } from '../api/queries'
import { dailyTemperatureChart, monthlyPrecipitationChart } from '../charts/definitions'
import { ChartCard } from '../components/ChartCard'
import { DataTable } from '../components/DataTable'
import { columnHelper } from '../components/table'
import { Segmented } from '../components/Segmented'
import { ErrorNotice, Loading, Notice } from '../components/States'
import { Tile } from '../components/Tile'
import { HISTORY_PERIODS } from '../lib/periods'
import { formatDate, parseDate } from '../lib/time'
import { completeMonthlyTotals, historyStats, lastDays, toCsv } from '../lib/transform'
import type { Units } from '../lib/units'
import { usePreferences } from '../preferences-context'

const locationRoute = getRouteApi('/locations/$locationId')
const historyRoute = getRouteApi('/locations/$locationId/history')
const helper = columnHelper<DailyHistory>()

function tableColumns(units: Units) {
  const temp = (v: number | null | undefined) => (v == null ? '–' : units.temp(v).toFixed(1))
  const precip = (v: number | null | undefined) =>
    v == null ? '–' : units.precip(v).toFixed(units.system === 'metric' ? 1 : 2)
  return helper.columns([
    helper.accessor('date', {
      header: 'Date',
      cell: (info) => formatDate(parseDate(info.getValue())),
    }),
    helper.accessor('temp_max', {
      header: `High (${units.tempLabel})`,
      cell: (info) => temp(info.getValue()),
    }),
    helper.accessor('temp_min', {
      header: `Low (${units.tempLabel})`,
      cell: (info) => temp(info.getValue()),
    }),
    helper.accessor('temp_mean', {
      header: `Mean (${units.tempLabel})`,
      cell: (info) => temp(info.getValue()),
    }),
    helper.accessor('precipitation_sum', {
      header: `Precipitation (${units.precipLabel})`,
      cell: (info) => precip(info.getValue()),
    }),
    helper.accessor('sunshine_duration', {
      header: 'Sunshine (h)',
      cell: (info) => {
        const seconds = info.getValue()
        return seconds == null ? '–' : (seconds / 3600).toFixed(1)
      },
    }),
  ])
}

function downloadCsv(rows: readonly DailyHistory[], units: Units, filename: string) {
  const csv = toCsv(
    rows.map((r) => ({
      date: r.date,
      [`temp_max_${units.tempLabel}`]:
        r.temp_max == null ? null : +units.temp(r.temp_max).toFixed(2),
      [`temp_min_${units.tempLabel}`]:
        r.temp_min == null ? null : +units.temp(r.temp_min).toFixed(2),
      [`temp_mean_${units.tempLabel}`]:
        r.temp_mean == null ? null : +units.temp(r.temp_mean).toFixed(2),
      [`precipitation_${units.precipLabel}`]:
        r.precipitation_sum == null ? null : +units.precip(r.precipitation_sum).toFixed(3),
      sunshine_hours: r.sunshine_duration == null ? null : +(r.sunshine_duration / 3600).toFixed(2),
    })),
  )
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function HistoryPage() {
  const location = locationRoute.useLoaderData()
  const { units, palette } = usePreferences()
  const navigate = useNavigate({ from: '/locations/$locationId/history' })
  const { period = '1y' } = historyRoute.useSearch()
  const selected = HISTORY_PERIODS.find((p) => p.value === period) ?? HISTORY_PERIODS[2]
  const { data, isPending, error, refetch } = useQuery(historyQuery(location.id))

  const view = useMemo(() => {
    if (!data || data.length === 0) return null
    const rows = lastDays(data, selected.days)
    const daily = rows.flatMap((r) =>
      r.temp_min == null || r.temp_max == null || r.temp_mean == null
        ? []
        : [
            {
              date: parseDate(r.date),
              low: units.temp(r.temp_min),
              high: units.temp(r.temp_max),
              mean: units.temp(r.temp_mean),
            },
          ],
    )
    const monthly = completeMonthlyTotals(rows, 'precipitation_sum').map((m) => ({
      month: m.month,
      total: units.precip(m.total),
    }))
    return {
      rows,
      stats: historyStats(rows),
      temperature:
        daily.length >= 2 ? dailyTemperatureChart(daily, { unit: units.tempLabel, palette }) : null,
      monthly: monthly.length
        ? monthlyPrecipitationChart(monthly, { unit: units.precipLabel, palette })
        : null,
      columns: tableColumns(units),
      tableRows: [...rows].reverse(),
    }
  }, [data, selected.days, units, palette])

  if (isPending) return <Loading height={400} />
  if (error) return <ErrorNotice error={error} onRetry={() => void refetch()} />
  if (!view)
    return (
      <Notice>Historical data is backfilled from Open-Meteo after the first collection.</Notice>
    )

  const { stats, rows } = view
  const tempValue = (v: number) => `${units.temp(v).toFixed(1)}${units.tempLabel}`
  const precipValue = (v: number, digits: number) =>
    `${units.precip(v).toFixed(digits)} ${units.precipLabel}`

  return (
    <div className="stack">
      <div className="form-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Segmented
          label="Period"
          value={selected.value}
          options={HISTORY_PERIODS}
          onChange={(value) => void navigate({ search: { period: value }, replace: true })}
        />
        <span className="caption">
          Daily data from the Open-Meteo archive, {formatDate(parseDate(rows[0]!.date))} to{' '}
          {formatDate(parseDate(rows.at(-1)!.date))}
        </span>
      </div>
      <div className="tiles">
        {stats.warmest ? (
          <Tile
            label="Warmest day"
            value={tempValue(stats.warmest.value)}
            detail={formatDate(stats.warmest.date!)}
          />
        ) : null}
        {stats.coldest ? (
          <Tile
            label="Coldest day"
            value={tempValue(stats.coldest.value)}
            detail={formatDate(stats.coldest.date!)}
          />
        ) : null}
        {stats.wettest ? (
          <Tile
            label="Wettest day"
            value={precipValue(stats.wettest.value, units.system === 'metric' ? 1 : 2)}
            detail={formatDate(stats.wettest.date!)}
          />
        ) : null}
        {stats.totalPrecipitation != null ? (
          <Tile
            label="Total precipitation"
            value={precipValue(stats.totalPrecipitation, units.system === 'metric' ? 0 : 1)}
          />
        ) : null}
      </div>
      {view.temperature ? (
        <ChartCard
          title="Daily temperature"
          description="Line shows the daily mean; the band spans the daily low to high."
        >
          <Chart
            definition={view.temperature}
            height={300}
            className="chart"
            ariaLabel={`Daily temperature range over the last ${selected.label}`}
          />
        </ChartCard>
      ) : null}
      <ChartCard title="Monthly precipitation" description="Complete months only.">
        {view.monthly ? (
          <Chart
            definition={view.monthly}
            height={260}
            className="chart"
            ariaLabel={`Monthly precipitation totals over the last ${selected.label}`}
          />
        ) : (
          <p className="caption">No complete months in this period yet.</p>
        )}
      </ChartCard>
      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Data table</summary>
        <div className="form-row" style={{ margin: '12px 0' }}>
          <button
            type="button"
            className="button"
            onClick={() =>
              downloadCsv(
                rows,
                units,
                `${location.name.toLowerCase().replace(/\s+/g, '-')}-history.csv`,
              )
            }
          >
            Download CSV
          </button>
        </div>
        <DataTable data={view.tableRows} columns={view.columns} caption="Daily history" />
      </details>
    </div>
  )
}
