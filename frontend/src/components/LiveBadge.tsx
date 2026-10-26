import { useOnline } from '../lib/app'
import { useLiveStatus } from '../live-context'

const LABELS = {
  live: { text: 'Live', title: 'Updates appear as soon as new data is collected' },
  connecting: { text: 'Connecting…', title: 'Connecting to live updates' },
  offline: { text: 'Offline', title: 'Live updates unavailable; refreshing every minute' },
} as const

export function LiveBadge() {
  // With no network at all, say so rather than "connecting" indefinitely.
  const online = useOnline()
  const live = useLiveStatus()
  const status = online ? live : 'offline'
  const { text, title } = LABELS[status]
  return (
    <span className={`live-badge live-${status}`} title={title} role="status" aria-live="polite">
      <span className="live-dot" aria-hidden="true" />
      {text}
    </span>
  )
}
