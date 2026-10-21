import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'

import { KIND_QUERIES } from './api/queries'
import { connectLive, invalidateForKinds, type LiveStatus } from './lib/live'
import { LiveContext } from './live-context'

// While the live stream is down, refresh on a timer instead.
const FALLBACK_POLL_MS = 60_000

export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<LiveStatus>('connecting')

  useEffect(() => connectLive(queryClient, setStatus), [queryClient])

  useEffect(() => {
    if (status !== 'offline') return
    const timer = setInterval(
      () => invalidateForKinds(queryClient, Object.keys(KIND_QUERIES)),
      FALLBACK_POLL_MS,
    )
    return () => clearInterval(timer)
  }, [status, queryClient])

  return <LiveContext value={status}>{children}</LiveContext>
}
