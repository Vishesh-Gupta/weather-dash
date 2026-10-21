import type { QueryClient } from '@tanstack/react-query'

import { KIND_QUERIES, queryKeys } from '../api/queries'

export type LiveStatus = 'connecting' | 'live' | 'offline'

interface DataEvent {
  kinds: string[]
}

/** Invalidate exactly the queries a finished collection run affects. */
export function invalidateForKinds(queryClient: QueryClient, kinds: readonly string[]) {
  const suffixes = new Set(kinds.flatMap((kind) => KIND_QUERIES[kind] ?? []))
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview })
  void queryClient.invalidateQueries({ queryKey: queryKeys.latestRun })
  if (suffixes.size === 0) return
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const [root, , suffix] = query.queryKey
      return root === 'locations' && typeof suffix === 'string' && suffixes.has(suffix)
    },
  })
}

export function invalidateLocations(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.locations, exact: true })
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview })
}

/**
 * Subscribe to the API's event stream. EventSource reconnects on its own; while
 * it is down the status reads "offline" and callers fall back to polling.
 */
export function connectLive(
  queryClient: QueryClient,
  onStatus: (status: LiveStatus) => void,
  url = '/api/events',
): () => void {
  if (typeof EventSource === 'undefined') {
    onStatus('offline')
    return () => {}
  }
  const source = new EventSource(url)
  let everConnected = false
  onStatus('connecting')

  source.addEventListener('ready', () => {
    // After a reconnect, anything may have changed while we were away.
    if (everConnected) invalidateForKinds(queryClient, Object.keys(KIND_QUERIES))
    everConnected = true
    onStatus('live')
  })
  source.addEventListener('data', (event) => {
    const { kinds } = JSON.parse((event as MessageEvent<string>).data) as DataEvent
    invalidateForKinds(queryClient, kinds)
  })
  source.addEventListener('locations', () => invalidateLocations(queryClient))
  source.addEventListener('error', () =>
    onStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting'),
  )

  return () => source.close()
}
