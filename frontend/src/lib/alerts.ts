import type { Alert } from '../api/client'

export type AlertLevel = 'critical' | 'serious' | 'warning'

/**
 * How urgent an alert is, from its name. Agencies name alerts by a shared
 * convention: a warning means the hazard is happening or imminent, a watch that
 * it may develop, and advisories and statements are for less serious conditions.
 */
export function alertLevel(event: string): AlertLevel {
  const name = event.toLowerCase()
  if (/emergency|extreme|tornado warning|hurricane warning|tsunami warning/.test(name))
    return 'critical'
  if (name.includes('warning')) return 'serious'
  return 'warning'
}

const RANK: Record<AlertLevel, number> = { critical: 0, serious: 1, warning: 2 }

/** Most urgent first, then soonest-ending. */
export function sortAlerts(alerts: readonly Alert[]): Alert[] {
  return [...alerts].sort(
    (a, b) =>
      RANK[alertLevel(a.event)] - RANK[alertLevel(b.event)] ||
      Date.parse(a.ends_at ?? '9999') - Date.parse(b.ends_at ?? '9999'),
  )
}
