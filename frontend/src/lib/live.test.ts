import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { connectLive, invalidateForKinds } from './live'

function clientWithQueries() {
  const client = new QueryClient()
  const keys = [
    ['overview'],
    ['locations'],
    ['locations', 1],
    ['locations', 1, 'current'],
    ['locations', 1, 'observations', 7],
    ['locations', 1, 'forecast'],
    ['locations', 2, 'air-quality', 7],
    ['locations', 1, 'history'],
  ]
  for (const key of keys) client.setQueryData(key, 'x')
  return client
}

const stale = (client: QueryClient) =>
  client
    .getQueryCache()
    .getAll()
    .filter((q) => q.state.isInvalidated)
    .map((q) => q.queryKey)

describe('invalidateForKinds', () => {
  it('refreshes only what a run collected', () => {
    const client = clientWithQueries()
    invalidateForKinds(client, ['current'])
    expect(stale(client)).toEqual([
      ['overview'],
      ['locations', 1, 'current'],
      ['locations', 1, 'observations', 7],
    ])
  })

  it('refreshes air quality for every location', () => {
    const client = clientWithQueries()
    invalidateForKinds(client, ['air_quality'])
    expect(stale(client)).toContainEqual(['locations', 2, 'air-quality', 7])
    expect(stale(client)).not.toContainEqual(['locations', 1, 'forecast'])
  })
})

class FakeEventSource {
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  readyState = 1
  listeners = new Map<string, ((event: MessageEvent) => void)[]>()
  closed = false
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? [])
      listener(new MessageEvent(type, { data: JSON.stringify(data ?? {}) }))
  }
  close() {
    this.closed = true
  }
}

describe('connectLive', () => {
  afterEach(() => {
    FakeEventSource.instances = []
  })

  it('reports status and invalidates on events', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const client = clientWithQueries()
    const statuses: string[] = []
    const disconnect = connectLive(client, (s) => statuses.push(s))
    const source = FakeEventSource.instances[0]!

    source.emit('ready')
    expect(statuses).toEqual(['connecting', 'live'])

    source.emit('data', { kinds: ['forecast'] })
    expect(stale(client)).toContainEqual(['locations', 1, 'forecast'])

    source.emit('locations', { added: [3], removed: [] })
    expect(stale(client)).toContainEqual(['locations'])

    source.readyState = FakeEventSource.CLOSED
    source.emit('error')
    expect(statuses.at(-1)).toBe('offline')

    disconnect()
    expect(source.closed).toBe(true)
  })

  it('refreshes everything after reconnecting', () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const client = clientWithQueries()
    connectLive(client, () => {})
    const source = FakeEventSource.instances[0]!
    source.emit('ready')
    expect(stale(client)).toEqual([])
    source.emit('ready')
    expect(stale(client)).toContainEqual(['locations', 1, 'forecast'])
    expect(stale(client)).toContainEqual(['locations', 2, 'air-quality', 7])
  })

  it('works without EventSource support', () => {
    vi.stubGlobal('EventSource', undefined)
    const statuses: string[] = []
    connectLive(new QueryClient(), (s) => statuses.push(s))
    expect(statuses).toEqual(['offline'])
  })
})
