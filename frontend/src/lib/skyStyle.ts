import type { CSSProperties } from 'react'

import type { SkyPalette } from './atmosphere'

/** The scrim's own colour (#080c14), as sRGB 0–1. */
const SCRIM = [8 / 255, 12 / 255, 20 / 255]
/**
 * Highest background luminance that keeps the secondary text colour (#e2e8f0,
 * luminance 0.79) at WCAG AA 4.5:1; white text then has more than that.
 */
const MAX_BACKGROUND_LUMINANCE = (0.79 + 0.05) / 4.5 - 0.05

const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))

function channels(hex: string) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
}

function luminanceUnder(rgb: number[], alpha: number) {
  const [r, g, b] = rgb.map((v, i) => linear(v * (1 - alpha) + SCRIM[i]! * alpha))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** The lightest scrim over these sky colours that keeps text at 4.5:1 or better. */
export function scrimFor(palette: SkyPalette): number {
  const colours = [palette.zenith, palette.horizon, palette.glow].map(channels)
  for (let alpha = 0.15; alpha < 0.9; alpha += 0.01) {
    if (colours.every((c) => luminanceUnder(c, alpha) <= MAX_BACKGROUND_LUMINANCE)) {
      return Math.round(alpha * 100) / 100
    }
  }
  return 0.9
}

/** The sky's colours as CSS custom properties, for gradients and tints. */
export function skyStyle(palette: SkyPalette): CSSProperties {
  return {
    '--sky-zenith': palette.zenith,
    '--sky-horizon': palette.horizon,
    '--sky-glow': palette.glow,
    '--sky-scrim': scrimFor(palette),
  } as CSSProperties
}
