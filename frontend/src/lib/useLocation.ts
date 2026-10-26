import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'

import { locationQuery } from '../api/queries'

const locationRoute = getRouteApi('/locations/$locationId')

/**
 * The current location, kept live. The route loader has already put it in the
 * cache; reading it through a query (rather than loader data) picks up later
 * changes such as the UTC offset arriving after the first collection or
 * shifting at a daylight-saving change.
 */
export function useLocation() {
  const { locationId } = locationRoute.useParams()
  return useSuspenseQuery(locationQuery(locationId)).data
}
