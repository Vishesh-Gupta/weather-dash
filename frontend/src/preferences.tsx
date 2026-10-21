import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'

import { palettes } from './charts/palette'
import { readPreference, writePreference } from './lib/storage'
import { unitsFor, type UnitSystem } from './lib/units'
import {
  PreferencesContext,
  type Preferences,
  type ResolvedTheme,
  type ThemePreference,
} from './preferences-context'

const UNIT_SYSTEMS = ['metric', 'imperial'] as const
const THEMES = ['system', 'light', 'dark'] as const

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)')

function subscribeToSystemTheme(onChange: () => void) {
  const query = darkQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

const systemPrefersDark = () => darkQuery()?.matches ?? false

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>(() =>
    readPreference('units', UNIT_SYSTEMS, 'metric'),
  )
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    readPreference('theme', THEMES, 'system'),
  )
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark, () => false)
  const resolvedTheme: ResolvedTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])

  const value = useMemo<Preferences>(
    () => ({
      units: unitsFor(unitSystem),
      setUnitSystem: (system) => {
        setUnitSystemState(system)
        writePreference('units', system)
      },
      theme,
      resolvedTheme,
      setTheme: (next) => {
        setThemeState(next)
        writePreference('theme', next)
      },
      palette: palettes[resolvedTheme],
    }),
    [unitSystem, theme, resolvedTheme],
  )

  return <PreferencesContext value={value}>{children}</PreferencesContext>
}
