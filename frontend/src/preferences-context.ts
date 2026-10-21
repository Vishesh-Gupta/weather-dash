import { createContext, use } from 'react'

import type { ChartPalette } from './charts/palette'
import type { Units, UnitSystem } from './lib/units'

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export interface Preferences {
  units: Units
  setUnitSystem: (system: UnitSystem) => void
  theme: ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
  palette: ChartPalette
}

export const PreferencesContext = createContext<Preferences | null>(null)

export function usePreferences(): Preferences {
  const preferences = use(PreferencesContext)
  if (!preferences) throw new Error('usePreferences must be used inside PreferencesProvider')
  return preferences
}
