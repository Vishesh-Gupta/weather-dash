import { describe, expect, it } from 'vitest'

import { radarTiles } from './radar'

describe('radarTiles', () => {
  it('builds the tile template for a frame', () => {
    expect(
      radarTiles('https://tilecache.rainviewer.com', { time: 1, path: '/v2/radar/abc123' }),
    ).toBe('https://tilecache.rainviewer.com/v2/radar/abc123/256/{z}/{x}/{y}/2/1_1.png')
  })
})
