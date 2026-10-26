// Rain radar from RainViewer's free public API: the past two hours in 10-minute
// frames, as map tiles. https://www.rainviewer.com/api.html
// The free tier serves one colour scheme ("Universal Blue") up to zoom level 7;
// beyond that the map enlarges zoom-7 tiles.

import { queryOptions } from '@tanstack/react-query'

export const RADAR_INDEX_URL = 'https://api.rainviewer.com/public/weather-maps.json'
export const RADAR_MAX_ZOOM = 7

export interface RadarFrame {
  /** Unix seconds. */
  time: number
  path: string
}

export interface RadarIndex {
  host: string
  radar: { past: RadarFrame[] }
}

/** Tile URL template for a frame, in Leaflet's {z}/{x}/{y} form. */
export const radarTiles = (host: string, frame: RadarFrame) =>
  // 256px tiles, colour scheme 2, smoothed, with snow shown in its own colours.
  `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`

export const radarQuery = () =>
  queryOptions({
    queryKey: ['radar-frames'],
    queryFn: async (): Promise<RadarIndex> => {
      const response = await fetch(RADAR_INDEX_URL)
      if (!response.ok) throw new Error(`Radar unavailable (${response.status})`)
      return (await response.json()) as RadarIndex
    },
    // A new frame arrives every 10 minutes.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  })

/**
 * The legend: RainViewer's Universal Blue scheme, sampled from its tiles, from
 * drizzle (sand) through light to heavy rain (blues) to storms and hail.
 */
export const RADAR_LEGEND = [
  { color: '#d2c48b', label: 'Drizzle' },
  { color: '#88ddee', label: '' },
  { color: '#00a3e0', label: '' },
  { color: '#005588', label: 'Heavy' },
  { color: '#ffee00', label: '' },
  { color: '#ff9500', label: 'Storm' },
  { color: '#c10000', label: '' },
  { color: '#ffaaff', label: 'Hail' },
] as const

/**
 * Map tiles under the radar: OpenStreetMap's own, which need no key (light use with
 * attribution, per https://operations.osmfoundation.org/policies/tiles/). They are
 * recoloured dark in CSS to sit with the rest of the app.
 */
export const BASEMAP_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const RADAR_ATTRIBUTION = 'Radar © <a href="https://www.rainviewer.com/">RainViewer</a>'
