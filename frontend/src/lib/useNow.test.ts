import { describe, expect, it } from 'vitest'

import { relativeTime } from './useNow'

describe('relativeTime', () => {
  const now = Date.parse('2026-10-21T16:00:00Z')
  it.each([
    [10, 'just now'],
    [90, '2 min ago'],
    [59 * 60, '59 min ago'],
    [3 * 3600, '3 h ago'],
    [26 * 3600, '1 day ago'],
    [-30, 'just now'],
  ])('%ss → %s', (seconds, text) => {
    expect(relativeTime(now - seconds * 1000, now)).toBe(text)
  })
})
