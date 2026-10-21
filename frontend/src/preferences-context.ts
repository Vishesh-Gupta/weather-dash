import { createContext, use } from 'react'

import type { ChartPalette } from './charts/palette'
import type { Units, UnitSystem } from './lib/units'

export interface Preferences {
  units: Units
  setUnitSystem: (system: UnitSystem) => void
  /** Charts sit on dark glass over the sky, so they always use the dark-surface palette. */
  palette: ChartPalette
}

export const PreferencesContext = createContext<Preferences | null>(null)

export function usePreferences(): Preferences {
  const preferences = use(PreferencesContext)
  if (!preferences) throw new Error('usePreferences must be used inside PreferencesProvider')
  return preferences
}
