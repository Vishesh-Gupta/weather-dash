import { describe, expect, it } from 'vitest'

import {
  dayKey,
  formatDayTime,
  formatTime,
  formatUtcOffset,
  parseDate,
  toLocationTime,
} from './time'

describe('location time', () => {
  it('shifts UTC timestamps to the location wall clock', () => {
    const toronto = toLocationTime('2026-10-21T14:00:00Z', -14400)
    expect(formatTime(toronto)).toBe('10:00')
    expect(formatDayTime(toronto)).toBe('Wed 21 Oct, 10:00')
  })

  it('changes calendar day across midnight', () => {
    const tokyo = toLocationTime('2026-10-21T20:00:00Z', 9 * 3600)
    expect(dayKey(tokyo)).toBe('2026-10-22')
  })

  it('treats a missing offset as UTC', () => {
    expect(formatTime(toLocationTime('2026-10-21T14:05:00Z', null))).toBe('14:05')
  })

  it('parses calendar dates without timezone drift', () => {
    expect(dayKey(parseDate('2026-01-31'))).toBe('2026-01-31')
  })

  it.each([
    [-14400, 'UTC−4'],
    [19800, 'UTC+5:30'],
    [0, 'UTC+0'],
  ])('formatUtcOffset(%s) = %s', (seconds, expected) => {
    expect(formatUtcOffset(seconds)).toBe(expected)
  })
})
