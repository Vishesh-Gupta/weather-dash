import type { ReactNode } from 'react'

/** A titled chart region. Charts carry their own aria label; the visible title and
 *  description give sighted and screen-reader users the same context. */
export function ChartCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {description ? (
        <p className="caption" style={{ margin: '0 0 8px' }}>
          {description}
        </p>
      ) : null}
      {children}
    </section>
  )
}
