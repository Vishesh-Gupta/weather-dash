import { useSyncExternalStore } from 'react'

/** A clock shared by every component ticking at the same interval. */
class Clock {
  private now = Date.now()
  private listeners = new Set<() => void>()
  private timer: ReturnType<typeof setInterval> | undefined
  private readonly intervalMs: number

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (!this.timer) {
      this.now = Date.now()
      this.timer = setInterval(() => {
        this.now = Date.now()
        this.listeners.forEach((notify) => notify())
      }, this.intervalMs)
    }
    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = undefined
      }
    }
  }

  getSnapshot = () => this.now
}

const clocks = new Map<number, Clock>()

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs)
  if (!clock) {
    clock = new Clock(intervalMs)
    clocks.set(intervalMs, clock)
  }
  return clock
}

/** The current time in ms, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const clock = clockFor(intervalMs)
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot)
}

export function relativeTime(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
