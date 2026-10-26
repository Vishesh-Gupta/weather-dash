import type { QueryClient } from '@tanstack/react-query'

import { KIND_QUERIES, queryKeys } from '../api/queries'

export type LiveStatus = 'connecting' | 'live' | 'offline'

interface DataEvent {
  kinds: string[]
}

/** Invalidate exactly the queries a finished collection run affects. */
export function invalidateForKinds(queryClient: QueryClient, kinds: readonly string[]) {
  // History is backfilled and topped up by whichever run finds it due.
  const suffixes = new Set(['history', ...kinds.flatMap((kind) => KIND_QUERIES[kind] ?? [])])
  // Current conditions also refresh the location's UTC offset (it moves at DST changes).
  const location = kinds.includes('current')
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview })
  void queryClient.invalidateQueries({ queryKey: queryKeys.latestRun })
  void queryClient.invalidateQueries({
    predicate: (query) => {
      const [root, id, suffix] = query.queryKey
      if (root !== 'locations') return false
      if (suffix === undefined) return location && id !== undefined
      return typeof suffix === 'string' && suffixes.has(suffix)
    },
  })
}

export function invalidateLocations(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.locations, exact: true })
  void queryClient.invalidateQueries({ queryKey: queryKeys.overview })
}

const RETRY_MIN_MS = 2_000
const RETRY_MAX_MS = 60_000

/**
 * Subscribe to the API's event stream. EventSource retries dropped connections
 * on its own, but gives up for good on an HTTP error (a proxy's 502 during a
 * deploy, a 503 when the server is full); then we reconnect with backoff.
 * Hidden tabs let go of their connection, since browsers allow only a handful
 * per host over HTTP/1.1, and catch up when shown again. While disconnected
 * the status reads "offline" and callers fall back to polling.
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
  let source: EventSource | null = null
  let retry: ReturnType<typeof setTimeout> | undefined
  let delay = RETRY_MIN_MS
  let everConnected = false

  const open = () => {
    clearTimeout(retry)
    source?.close()
    const current = new EventSource(url)
    source = current
    onStatus('connecting')
    current.addEventListener('ready', () => {
      // After a reconnect, anything may have changed while we were away.
      if (everConnected) invalidateForKinds(queryClient, Object.keys(KIND_QUERIES))
      everConnected = true
      delay = RETRY_MIN_MS
      onStatus('live')
    })
    current.addEventListener('data', (event) => {
      const { kinds } = JSON.parse((event as MessageEvent<string>).data) as DataEvent
      invalidateForKinds(queryClient, kinds)
    })
    current.addEventListener('locations', () => invalidateLocations(queryClient))
    current.addEventListener('error', () => {
      if (current.readyState !== EventSource.CLOSED) return onStatus('connecting')
      onStatus('offline')
      retry = setTimeout(open, delay)
      delay = Math.min(delay * 2, RETRY_MAX_MS)
    })
  }

  const close = () => {
    clearTimeout(retry)
    source?.close()
    source = null
  }

  const onVisibility = () => {
    if (document.hidden) close()
    else if (!source) open()
  }

  if (typeof document === 'undefined' || !document.hidden) open()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  return () => {
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisibility)
    close()
  }
}
