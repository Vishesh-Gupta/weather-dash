import { useMemo, useState, type ReactNode } from 'react'

import { palettes } from './charts/palette'
import { readPreference, writePreference } from './lib/storage'
import { unitsFor, type UnitSystem } from './lib/units'
import { PreferencesContext, type Preferences } from './preferences-context'

const UNIT_SYSTEMS = ['metric', 'imperial'] as const

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [unitSystem, setUnitSystemState] = useState<UnitSystem>(() =>
    readPreference('units', UNIT_SYSTEMS, 'metric'),
  )

  const value = useMemo<Preferences>(
    () => ({
      units: unitsFor(unitSystem),
      setUnitSystem: (system) => {
        setUnitSystemState(system)
        writePreference('units', system)
      },
      palette: palettes.dark,
    }),
    [unitSystem],
  )

  return <PreferencesContext value={value}>{children}</PreferencesContext>
}
