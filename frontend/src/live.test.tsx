import { screen, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mockApi, renderApp } from './test/app'
import { observation } from './test/fixtures'

class FakeEventSource {
  static CLOSED = 2
  static instances: FakeEventSource[] = []
  readyState = 1
  listeners = new Map<string, ((event: MessageEvent) => void)[]>()
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, data: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? [])
      listener(new MessageEvent(type, { data: JSON.stringify(data) }))
  }
  close() {}
}

afterEach(() => {
  FakeEventSource.instances = []
})

describe('live updates', () => {
  it('shows connection status in the header', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    mockApi()
    renderApp('/locations/1')
    expect(await screen.findByText('Connecting…')).toBeInTheDocument()
    act(() => FakeEventSource.instances[0]!.emit('ready'))
    expect(await screen.findByText('Live')).toBeInTheDocument()
  })

  it('updates the page in place when new data is collected', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    let current = observation(0, 17)
    mockApi({ 'GET /api/locations/1/current': () => current })
    renderApp('/locations/1')
    const hero = await screen.findByRole('region', { name: /Current weather/ })
    expect(within(hero).getByText('17°')).toBeInTheDocument()

    current = observation(0, 21)
    act(() => {
      const source = FakeEventSource.instances[0]!
      source.emit('ready')
      source.emit('data', { kinds: ['current'], run_id: 2 })
    })
    expect(await within(hero).findByText('21°')).toBeInTheDocument()
  })

  it('reports offline when live updates are unavailable', async () => {
    vi.stubGlobal('EventSource', undefined)
    mockApi()
    renderApp('/locations/1')
    expect(await screen.findByText('Offline')).toBeInTheDocument()
  })
})
