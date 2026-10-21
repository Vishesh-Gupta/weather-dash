// Selectable time windows. They live in the URL so views are shareable.

export const OBSERVATION_WINDOWS = [
  { value: '24h', label: '24 hours', days: 1 },
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
] as const
export type ObservationWindow = (typeof OBSERVATION_WINDOWS)[number]['value']

export const HISTORY_PERIODS = [
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
  { value: '1y', label: '12 months', days: 365 },
  { value: '5y', label: '5 years', days: 365 * 5 + 1 },
  { value: 'all', label: 'All', days: null },
] as const
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number]['value']
