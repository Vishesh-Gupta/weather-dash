import { describe, expect, it } from 'vitest'

import { particleCounts } from './precipitation'

describe('particleCounts', () => {
  const screen = 1280 * 800

  it('scales with intensity and draws nothing in dry weather', () => {
    expect(particleCounts({ rain: 0, snow: 0 }, screen)).toEqual({ drops: 0, flakes: 0 })
    const light = particleCounts({ rain: 0.2, snow: 0 }, screen).drops
    const heavy = particleCounts({ rain: 0.9, snow: 0 }, screen).drops
    expect(light).toBeGreaterThan(0)
    expect(heavy).toBeGreaterThan(light * 3)
  })

  it('caps particles on very large screens', () => {
    const huge = particleCounts({ rain: 1, snow: 1 }, 7680 * 4320)
    expect(huge.drops).toBeLessThanOrEqual(700)
    expect(huge.flakes).toBeLessThanOrEqual(420)
  })
})
