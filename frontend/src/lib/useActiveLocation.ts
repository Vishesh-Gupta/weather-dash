import { useQuery } from '@tanstack/react-query'
import { useMatchRoute } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'

import type { OverviewItem } from '../api/client'
import { overviewQuery } from '../api/queries'
import { readNumberPreference, writePreference } from './storage'

const LAST_LOCATION_KEY = 'last-location'

/**
 * The location whose sky fills the page: the one being viewed, otherwise the
 * last one viewed in this browser, otherwise the first tracked location.
 */
export function useActiveLocation(): { items: OverviewItem[]; active: OverviewItem | undefined } {
  const { data: items = [] } = useQuery(overviewQuery())
  const matchRoute = useMatchRoute()
  const match = matchRoute({ to: '/locations/$locationId', fuzzy: true })
  const routeId = match ? Number(match.locationId) : undefined

  useEffect(() => {
    if (routeId) writePreference(LAST_LOCATION_KEY, String(routeId))
  }, [routeId])

  const active = useMemo(() => {
    const wanted = routeId ?? readNumberPreference(LAST_LOCATION_KEY)
    return items.find((item) => item.location.id === wanted) ?? items[0]
  }, [items, routeId])

  return { items, active }
}
