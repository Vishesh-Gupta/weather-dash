import { describe, expect, it } from 'vitest'

import source from '../../public/sw.js?raw'

// The service worker is plain JavaScript served as-is; load it with a stand-in `self`.
const strategyFor = new Function('self', 'caches', `${source}\nreturn strategyFor`)(
  { location: { origin: 'https://weather.example' }, addEventListener: () => {} },
  {},
) as (url: URL, request: { method: string; mode: string }) => string

const route = (path: string, method = 'GET', mode = 'cors') =>
  strategyFor(new URL(path, 'https://weather.example'), { method, mode })

describe('service worker routing', () => {
  it('opens pages from the saved app when offline', () => {
    expect(route('/locations/1', 'GET', 'navigate')).toBe('page')
  })

  it('keeps the last copy of API data', () => {
    expect(route('/api/overview')).toBe('data')
    expect(route('/api/locations/1/hourly')).toBe('data')
  })

  it('caches built files for good', () => {
    expect(route('/assets/index-abc123.js')).toBe('asset')
    expect(route('/icon-192.png')).toBe('static')
  })

  it('leaves the live stream, writes and other sites alone', () => {
    expect(route('/api/events')).toBe('network')
    expect(route('/api/docs')).toBe('network')
    expect(route('/api/session', 'POST')).toBe('network')
    expect(
      strategyFor(new URL('https://tile.openstreetmap.org/1/1/1.png'), {
        method: 'GET',
        mode: 'no-cors',
      }),
    ).toBe('network')
  })
})
