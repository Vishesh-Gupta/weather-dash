import { describe, expect, it } from 'vitest'

import { scrimFor } from './skyStyle'

const palette = (zenith: string, horizon: string, glow: string) => ({
  zenith,
  horizon,
  glow,
  brightness: 0,
})

describe('scrimFor', () => {
  it('barely dims a night sky', () => {
    expect(scrimFor(palette('#121b33', '#1c2940', '#1d293e'))).toBe(0.15)
  })

  it('dims a bright day sky enough for text', () => {
    const day = scrimFor(palette('#3e6296', '#9fc8e7', '#c5dbef'))
    expect(day).toBeGreaterThan(0.4)
    expect(day).toBeLessThan(0.9)
  })

  it('handles pure white glare', () => {
    expect(scrimFor(palette('#ffffff', '#ffffff', '#ffffff'))).toBeLessThanOrEqual(0.9)
  })
})
