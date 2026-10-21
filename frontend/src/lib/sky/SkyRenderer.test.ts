import { describe, expect, it } from 'vitest'

import { flashAt } from './SkyRenderer'

describe('flashAt', () => {
  it('flashes twice and fades within half a second', () => {
    expect(flashAt(0)).toBe(1)
    expect(flashAt(120)).toBeLessThan(0.2)
    // The return stroke brightens the sky again.
    expect(flashAt(170)).toBeGreaterThan(flashAt(150))
    expect(flashAt(600)).toBeLessThan(0.05)
  })
})
