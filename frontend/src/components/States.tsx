import type { ReactNode } from 'react'

import { errorText } from '../lib/errors'

export function Notice({
  children,
  tone = 'info',
}: {
  children: ReactNode
  tone?: 'info' | 'error'
}) {
  return (
    <div
      className={tone === 'error' ? 'notice notice-error' : 'notice'}
      role={tone === 'error' ? 'alert' : undefined}
    >
      {children}
    </div>
  )
}

export function Loading({ label = 'Loading…', height = 160 }: { label?: string; height?: number }) {
  return (
    <div className="skeleton" style={{ minHeight: height }} role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
    </div>
  )
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <Notice tone="error">
      <strong>Couldn’t load this data.</strong> {errorText(error)}{' '}
      {onRetry ? (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </Notice>
  )
}
