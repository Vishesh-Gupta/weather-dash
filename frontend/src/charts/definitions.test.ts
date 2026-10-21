// @vitest-environment node
import { createChartScene, renderChartSvg } from '@tanstack/charts'
import { describe, expect, it } from 'vitest'

import {
  dailyTemperatureChart,
  monthlyPrecipitationChart,
  particulateChart,
  pollutantChart,
  precipitationAmountChart,
  precipitationChanceChart,
  temperatureChart,
  dailyTicks,
  timeTickFormat,
  type TempRow,
} from './definitions'
import { palettes } from './palette'

const palette = palettes.light
const start = Date.UTC(2026, 9, 21)
const hours = (n: number) => new Date(start + n * 3600 * 1000)

function render(definition: Parameters<typeof createChartScene>[0], label: string) {
  const scene = createChartScene(definition, { width: 640, height: 320 })
  const svg = renderChartSvg(scene, { ariaLabel: label })
  expect(svg).not.toMatch(/NaN|Infinity/)
  expect(svg).toContain(`aria-label="${label}"`)
  return { scene, svg }
}

describe('chart definitions', () => {
  it('draws temperature lines with unit ticks and both series', () => {
    const rows: TempRow[] = Array.from({ length: 24 }, (_, i) => [
      { time: hours(i), series: 'Temperature' as const, value: 10 + Math.sin(i / 4) * 5 },
      { time: hours(i), series: 'Feels like' as const, value: 8 + Math.sin(i / 4) * 5 },
    ]).flat()
    const { scene, svg } = render(
      temperatureChart(rows, { unit: '°C', palette, spanHours: 24 }),
      'Temperature',
    )
    expect(scene.points).toHaveLength(48)
    expect(svg).toContain('°C')
    expect(svg).toContain(palette.series1)
    expect(svg).toContain(palette.series2)
  })

  it('caps chance of precipitation at 100%', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      time: hours(i * 3),
      chance: (i * 7) % 100,
    }))
    const { svg } = render(precipitationChanceChart(rows, palette), 'Chance')
    expect(svg).toContain('100%')
  })

  it('stacks rain and snow', () => {
    const rows = Array.from({ length: 10 }, (_, i) => [
      { time: hours(i * 3), kind: 'Rain' as const, amount: i % 3 },
      { time: hours(i * 3), kind: 'Snow' as const, amount: i % 2 },
    ]).flat()
    render(precipitationAmountChart(rows, { unit: 'mm', palette }), 'Precipitation')
  })

  it('draws particulates', () => {
    const rows = Array.from({ length: 20 }, (_, i) => [
      { time: hours(i * 3), pollutant: 'PM2.5' as const, value: 5 + i },
      { time: hours(i * 3), pollutant: 'PM10' as const, value: 9 + i },
    ]).flat()
    render(particulateChart(rows, palette), 'Particulates')
  })

  it('handles zero concentrations on the log axis', () => {
    const rows = [
      { label: 'CO', value: 210 },
      { label: 'NO', value: 0 },
      { label: 'PM2.5', value: 6.2 },
    ]
    const { scene } = render(pollutantChart(rows, palette), 'Pollutants')
    expect(scene.points).toHaveLength(3)
  })

  it('draws the daily temperature band', () => {
    const rows = Array.from({ length: 365 }, (_, i) => {
      const mean = 10 + 12 * Math.sin(i / 58)
      return { date: new Date(start + i * 86400000), low: mean - 5, high: mean + 5, mean }
    })
    render(dailyTemperatureChart(rows, { unit: '°F', palette }), 'Daily temperature')
  })

  it('labels only some months for long ranges', () => {
    const rows = Array.from({ length: 24 }, (_, i) => ({
      month: new Date(Date.UTC(2024, i, 1)),
      total: 40 + i,
    }))
    const { svg } = render(monthlyPrecipitationChart(rows, { unit: 'mm', palette }), 'Monthly')
    expect(svg).toContain('Jan 2024')
    expect(svg).not.toContain('Feb 2024')
  })

  it('picks clock ticks for short spans', () => {
    expect(timeTickFormat(24)(hours(15))).toBe('15:00')
    expect(timeTickFormat(72)(hours(15))).toBe('21 Oct')
  })
})

describe('dailyTicks', () => {
  it('places one tick per local midnight', () => {
    const times = Array.from({ length: 40 }, (_, i) => hours(15 + i * 3))
    const ticks = dailyTicks(times)
    expect(ticks.map((t) => t.toISOString().slice(0, 10))).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ])
    expect(ticks.every((t) => t.getUTCHours() === 0)).toBe(true)
  })

  it('thins long spans', () => {
    const times = [hours(0), hours(24 * 30)]
    expect(dailyTicks(times, 6).length).toBeLessThanOrEqual(6)
  })
})
