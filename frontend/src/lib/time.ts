// Timestamps arrive in UTC. Locations carry their UTC offset, so "local time" here
// means the location's wall clock, independent of the viewer's own timezone.
//
// `toLocationTime` returns a Date whose UTC fields equal the location's wall-clock
// time; always format it with `timeZone: 'UTC'` (the formatters below do).

export function toLocationTime(iso: string, utcOffsetSeconds: number | null | undefined): Date {
  return new Date(Date.parse(iso) + (utcOffsetSeconds ?? 0) * 1000)
}

const formatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options })

const dayTime = formatter({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const time = formatter({ hour: '2-digit', minute: '2-digit' })
const dayMonth = formatter({ day: 'numeric', month: 'short' })
const dayMonthYear = formatter({ day: 'numeric', month: 'short', year: 'numeric' })
const weekdayDayMonth = formatter({ weekday: 'short', day: 'numeric', month: 'short' })
const monthYear = formatter({ month: 'short', year: 'numeric' })
const weekday = formatter({ weekday: 'short' })

export const formatDayTime = (d: Date) => dayTime.format(d)
export const formatTime = (d: Date) => time.format(d)
export const formatDayMonth = (d: Date) => dayMonth.format(d)
export const formatDate = (d: Date) => dayMonthYear.format(d)
export const formatWeekday = (d: Date) => weekdayDayMonth.format(d)
export const formatMonthYear = (d: Date) => monthYear.format(d)
export const formatDayName = (d: Date) => weekday.format(d)

/** Calendar date (YYYY-MM-DD) as a Date at UTC midnight, formatted with the helpers above. */
export const parseDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`)

/** The location-local calendar day key (YYYY-MM-DD) for a shifted Date. */
export const dayKey = (d: Date) => d.toISOString().slice(0, 10)

export function formatUtcOffset(seconds: number | null | undefined): string {
  const total = Math.round((seconds ?? 0) / 60)
  const sign = total < 0 ? '−' : '+'
  const abs = Math.abs(total)
  const minutes = abs % 60
  return `UTC${sign}${Math.floor(abs / 60)}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`
}
