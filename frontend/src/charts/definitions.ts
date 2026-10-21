// Chart definitions. Each builder takes display-ready rows (already converted to the
// viewer's units, times already shifted to location time) and returns a definition.
// Components memoize the result: definition identity is the chart's update boundary.
//
// Rules followed throughout: one y-axis per chart, fixed series colors, thin marks,
// rounded bar ends, recessive grid, x-unified hover with a formatted tooltip.

import { areaY, barX, barY, colorLegend, crosshair, defineChart, lineY } from '@tanstack/charts'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scaleOrdinal } from '@tanstack/charts/scales/ordinal'
import { tooltip } from '@tanstack/charts/tooltip'
import { scaleLog, scaleUtc } from 'd3-scale'

import { formatDate, formatDayMonth, formatDayTime, formatMonthYear, formatTime } from '../lib/time'
import type { ChartPalette } from './palette'

const GRID = { strokeOpacity: 0.12 }

/** Tick labels for a time axis: clock times for short spans, dates otherwise. */
export function timeTickFormat(spanHours: number): (d: Date) => string {
  return spanHours <= 36 ? formatTime : formatDayMonth
}

const DAY_MS = 86_400_000

/** Ticks at (location-local) midnights, thinned to at most `maxTicks`, so a date
 *  label appears once per day instead of once per 12-hour tick. */
export function dailyTicks(times: readonly Date[], maxTicks = 8): Date[] {
  if (times.length === 0) return []
  const ms = times.map((t) => t.getTime())
  const first = Math.ceil(Math.min(...ms) / DAY_MS) * DAY_MS
  const last = Math.max(...ms)
  const days = Math.floor((last - first) / DAY_MS) + 1
  const step = Math.max(1, Math.ceil(days / maxTicks))
  const ticks: Date[] = []
  for (let t = first; t <= last; t += step * DAY_MS) ticks.push(new Date(t))
  return ticks
}

/** Axis tick options for a time axis spanning `spanHours`. */
function timeTicks(times: readonly Date[], spanHours: number) {
  return spanHours <= 36
    ? { format: formatTime, count: 6 }
    : { format: formatDayMonth, values: dailyTicks(times) }
}

const fixed = (digits: number) => (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

// --- Temperature lines (observed or forecast) --------------------------------

export type TempSeries = 'Temperature' | 'Feels like'

export interface TempRow {
  time: Date
  series: TempSeries
  value: number
}

export function temperatureChart(
  rows: readonly TempRow[],
  options: { unit: string; palette: ChartPalette; spanHours: number },
) {
  const { unit, palette, spanHours } = options
  const format = fixed(1)
  return defineChart({
    marks: [
      crosshair({ x: true, y: false, strokeDasharray: '3 3' }),
      lineY(rows, { x: 'time', y: 'value', z: 'series', strokeWidth: 2 }),
    ],
    scales: {
      x: {
        scale: scaleUtc,
        axis: {
          ticks: timeTicks(
            rows.map((r) => r.time),
            spanHours,
          ),
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: GRID,
        axis: { ticks: { format: (v) => `${v}${unit}`, count: 5 } },
      },
    },
    color: {
      scale: scaleOrdinal<TempSeries, string>(
        ['Temperature', 'Feels like'],
        [palette.series1, palette.series2],
      ),
      legend: colorLegend({ placement: 'top' }),
    },
    focus: 'group-x',
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      content: (points) => ({
        title: points[0] ? formatDayTime(points[0].xValue) : '',
        rows: points.map((p) => ({
          label: p.groupLabel,
          value: `${format(p.yValue)}${unit}`,
          color: p.color,
        })),
      }),
    },
  })
}

// --- Forecast precipitation --------------------------------------------------

export interface ChanceRow {
  time: Date
  chance: number
}

export function precipitationChanceChart(rows: readonly ChanceRow[], palette: ChartPalette) {
  return defineChart({
    marks: [
      barY(rows, {
        x: 'time',
        y: 'chance',
        fill: palette.series1,
        radius: { end: 4 },
        maxThickness: 18,
      }),
    ],
    scales: {
      x: {
        scale: scaleUtc,
        axis: {
          ticks: {
            format: formatDayMonth,
            values: dailyTicks(
              rows.map((r) => r.time),
              6,
            ),
          },
        },
      },
      y: {
        scale: scaleLinear().domain([0, 100]),
        grid: GRID,
        axis: { ticks: { values: [0, 25, 50, 75, 100], format: (v) => `${v}%` } },
      },
    },
    focus: 'nearest-x',
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      content: (points) => ({
        title: points[0] ? formatDayTime(points[0].xValue) : '',
        rows: points.map((p) => ({
          label: 'Chance',
          value: `${Math.round(p.yValue)}%`,
          color: p.color,
        })),
      }),
    },
  })
}

export type PrecipKind = 'Rain' | 'Snow'

export interface PrecipRow {
  time: Date
  kind: PrecipKind
  amount: number
}

export function precipitationAmountChart(
  rows: readonly PrecipRow[],
  options: { unit: string; palette: ChartPalette },
) {
  const { unit, palette } = options
  const digits = unit === 'in' ? 2 : 1
  return defineChart({
    marks: [
      barY(rows, { x: 'time', y: 'amount', color: 'kind', radius: { end: 4 }, maxThickness: 18 }),
    ],
    scales: {
      x: {
        scale: scaleUtc,
        axis: {
          ticks: {
            format: formatDayMonth,
            values: dailyTicks(
              rows.map((r) => r.time),
              6,
            ),
          },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: GRID,
        axis: { ticks: { format: (v) => `${v} ${unit}`, count: 4 } },
      },
    },
    color: {
      scale: scaleOrdinal<PrecipKind, string>(['Rain', 'Snow'], [palette.series1, palette.series3]),
      legend: colorLegend({ placement: 'top' }),
    },
    focus: 'group-x',
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      content: (points) => ({
        title: points[0] ? formatDayTime(points[0].xValue) : '',
        rows: points.map((p) => ({
          label: p.groupLabel,
          value: `${p.yValue.toFixed(digits)} ${unit}`,
          color: p.color,
        })),
      }),
    },
  })
}

// --- Air quality ---------------------------------------------------------------

export type Particulate = 'PM2.5' | 'PM10'

export interface ParticulateRow {
  time: Date
  pollutant: Particulate
  value: number
}

export function particulateChart(rows: readonly ParticulateRow[], palette: ChartPalette) {
  return defineChart({
    marks: [
      crosshair({ x: true, y: false, strokeDasharray: '3 3' }),
      lineY(rows, { x: 'time', y: 'value', z: 'pollutant', strokeWidth: 2 }),
    ],
    scales: {
      x: {
        scale: scaleUtc,
        axis: {
          ticks: {
            format: formatDayMonth,
            values: dailyTicks(
              rows.map((r) => r.time),
              6,
            ),
          },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: GRID,
        axis: { ticks: { count: 5 }, label: 'µg/m³' },
      },
    },
    color: {
      scale: scaleOrdinal<Particulate, string>(
        ['PM2.5', 'PM10'],
        [palette.series1, palette.series2],
      ),
      legend: colorLegend({ placement: 'top' }),
    },
    focus: 'group-x',
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      content: (points) => ({
        title: points[0] ? formatDayTime(points[0].xValue) : '',
        rows: points.map((p) => ({
          label: p.groupLabel,
          value: `${p.yValue.toFixed(1)} µg/m³`,
          color: p.color,
        })),
      }),
    },
  })
}

export interface PollutantRow {
  label: string
  value: number
}

// Concentrations span four orders of magnitude (NO ≈ 0.1, CO ≈ 200), so the axis is
// logarithmic. Log bars need a positive baseline; values at or below it sit on it.
const LOG_FLOOR = 0.1

export function pollutantChart(rows: readonly PollutantRow[], palette: ChartPalette) {
  const max = Math.max(...rows.map((row) => row.value), 10)
  const upper = 10 ** Math.ceil(Math.log10(max) + 0.3)
  const ticks = [0.1, 1, 10, 100, 1000, 10000].filter((t) => t <= upper)
  const plotted = rows.map((row) => ({ ...row, plotted: Math.max(row.value, LOG_FLOOR) }))
  return defineChart({
    marks: [
      barX(plotted, {
        x1: LOG_FLOOR,
        x2: 'plotted',
        y: 'label',
        fill: palette.series1,
        radius: { end: 4 },
      }),
    ],
    scales: {
      x: {
        scale: scaleLog().domain([LOG_FLOOR, upper]),
        grid: GRID,
        axis: { label: 'µg/m³ (log scale)', ticks: { values: ticks, format: (v) => `${v}` } },
      },
      y: { scale: () => scaleBand<string>().padding(0.25) },
    },
    focus: 'nearest-y',
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      content: (points) => ({
        rows: points.map((p) => ({
          label: p.datum.label,
          value: `${p.datum.value.toFixed(2)} µg/m³`,
          color: p.color,
        })),
      }),
    },
  })
}

// --- History ---------------------------------------------------------------------

export interface DailyTempRow {
  date: Date
  low: number
  high: number
  mean: number
}

export function dailyTemperatureChart(
  rows: readonly DailyTempRow[],
  options: { unit: string; palette: ChartPalette },
) {
  const { unit, palette } = options
  const format = fixed(1)
  return defineChart({
    marks: [
      areaY(rows, { x: 'date', y1: 'low', y2: 'high', fill: palette.band, fillOpacity: 0.2 }),
      crosshair({ x: true, y: false, strokeDasharray: '3 3' }),
      lineY(rows, { x: 'date', y: 'mean', stroke: palette.series1, strokeWidth: 2 }),
    ],
    scales: {
      x: {
        scale: scaleUtc,
        axis: {
          ticks: { format: rows.length <= 120 ? formatDayMonth : formatMonthYear, count: 6 },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: GRID,
        axis: { ticks: { format: (v) => `${v}${unit}`, count: 5 } },
      },
    },
    focus: 'nearest-x',
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      // One row per day regardless of which mark was focused.
      content: (points) => {
        const day = points[0]?.datum
        if (!day) return { rows: [] }
        return {
          title: formatDate(day.date),
          rows: [
            { label: 'High', value: `${format(day.high)}${unit}` },
            { label: 'Mean', value: `${format(day.mean)}${unit}`, color: palette.series1 },
            { label: 'Low', value: `${format(day.low)}${unit}` },
          ],
        }
      },
    },
  })
}

export interface MonthlyRow {
  month: Date
  total: number
}

export function monthlyPrecipitationChart(
  rows: readonly MonthlyRow[],
  options: { unit: string; palette: ChartPalette },
) {
  const { unit, palette } = options
  const digits = unit === 'in' ? 2 : 0
  // Label every month for short ranges, otherwise only January and July.
  const labelEvery = rows.length > 14
  return defineChart({
    marks: [barY(rows, { x: 'month', y: 'total', fill: palette.series1, radius: { end: 4 } })],
    scales: {
      x: {
        scale: () => scaleBand<Date>().padding(0.25),
        axis: {
          ticks: {
            format: (d) => (!labelEvery || d.getUTCMonth() % 6 === 0 ? formatMonthYear(d) : ''),
          },
        },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: GRID,
        axis: { ticks: { format: (v) => `${v} ${unit}`, count: 4 } },
      },
    },
    focus: 'nearest-x',
    maxFocusDistance: Number.POSITIVE_INFINITY,
    tooltip: {
      use: tooltip,
      content: (points) => ({
        title: points[0] ? formatMonthYear(points[0].xValue) : '',
        rows: points.map((p) => ({
          label: 'Total',
          value: `${p.yValue.toFixed(digits)} ${unit}`,
          color: p.color,
        })),
      }),
    },
  })
}
