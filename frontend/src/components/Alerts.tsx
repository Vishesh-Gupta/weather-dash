import type { Alert } from '../api/client'
import { alertLevel, sortAlerts } from '../lib/alerts'
import { formatDayTime, formatTime, toLocationTime } from '../lib/time'

/** Government weather alerts in force, most urgent first; each opens to its full text. */
export function Alerts({
  alerts,
  offset,
  nowMs,
}: {
  alerts: readonly Alert[]
  offset: number | null
  nowMs: number
}) {
  const active = sortAlerts(alerts.filter((a) => !a.ends_at || Date.parse(a.ends_at) > nowMs))
  if (!active.length) return null
  const when = (iso: string) => {
    const local = toLocationTime(iso, offset)
    // Today's times need no date.
    const sameDay = toLocationTime(new Date(nowMs).toISOString(), offset).toISOString().slice(0, 10)
    return local.toISOString().slice(0, 10) === sameDay ? formatTime(local) : formatDayTime(local)
  }
  return (
    <section className="alerts" aria-label="Weather alerts">
      {active.map((alert, i) => {
        const level = alertLevel(alert.event)
        const upcoming = alert.starts_at && Date.parse(alert.starts_at) > nowMs
        return (
          <details key={`${alert.event}-${i}`} className={`alert alert-${level}`}>
            <summary>
              <span className="alert-icon" aria-hidden="true">
                !
              </span>
              <span className="alert-title">
                <strong>{alert.event}</strong>
                <span className="alert-when">
                  {upcoming
                    ? ` · from ${when(alert.starts_at!)}`
                    : alert.ends_at
                      ? ` · until ${when(alert.ends_at)}`
                      : ' · in force'}
                </span>
              </span>
            </summary>
            <div className="alert-body">
              {alert.description ? <p>{alert.description}</p> : null}
              {alert.sender ? <p className="caption">Issued by {alert.sender}</p> : null}
            </div>
          </details>
        )
      })}
    </section>
  )
}
