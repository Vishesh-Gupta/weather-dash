import { describe, expect, it } from 'vitest'

import { windWarning } from '../test/fixtures'
import { alertLevel, sortAlerts } from './alerts'

describe('alertLevel', () => {
  it('reads urgency from the conventional names', () => {
    expect(alertLevel('Tornado Warning')).toBe('critical')
    expect(alertLevel('Extreme Cold Warning')).toBe('critical')
    expect(alertLevel('Wind Warning')).toBe('serious')
    expect(alertLevel('Winter Storm Watch')).toBe('warning')
    expect(alertLevel('Special Weather Statement')).toBe('warning')
    expect(alertLevel('Small Craft Advisory')).toBe('warning')
  })
})

describe('sortAlerts', () => {
  it('puts the most urgent first, then the soonest to end', () => {
    const statement = { ...windWarning, event: 'Special Weather Statement' }
    const watch = { ...windWarning, event: 'Flood Watch', ends_at: '2026-10-21T15:00:00Z' }
    expect(sortAlerts([statement, windWarning, watch]).map((a) => a.event)).toEqual([
      'Wind Warning',
      'Flood Watch',
      'Special Weather Statement',
    ])
  })
})
