import 'leaflet/dist/leaflet.css'

import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ErrorNotice, Loading } from '../components/States'
import {
  BASEMAP_ATTRIBUTION,
  BASEMAP_TILES,
  RADAR_ATTRIBUTION,
  RADAR_LEGEND,
  RADAR_MAX_ZOOM,
  radarQuery,
  radarTiles,
} from '../lib/radar'
import { formatTime, toLocationTime } from '../lib/time'
import { useLocation } from '../lib/useLocation'
import { useNow } from '../lib/useNow'

const FRAME_MS = 600
const RADAR_OPACITY = 0.75

function minutesAgo(seconds: number, nowMs: number) {
  const minutes = Math.max(0, Math.round((nowMs - seconds * 1000) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${minutes % 60} min ago`
}

export function RadarPage() {
  const location = useLocation()
  const nowMs = useNow(60_000)
  const { data, error, isPending, refetch } = useQuery(radarQuery())
  const frames = useMemo(() => data?.radar.past ?? [], [data])
  // Null follows the latest frame as new ones arrive.
  const [selected, setSelected] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const current = frames.length ? Math.min(selected ?? frames.length - 1, frames.length - 1) : -1

  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef(new Map<string, L.TileLayer>())

  // The map, centred on the location.
  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, {
      center: [location.lat, location.lon],
      zoom: 6,
      minZoom: 3,
      maxZoom: 10,
      zoomSnap: 1,
    })
    L.tileLayer(BASEMAP_TILES, {
      attribution: BASEMAP_ATTRIBUTION,
      className: 'radar-basemap',
      maxZoom: 19,
    }).addTo(instance)
    L.circleMarker([location.lat, location.lon], {
      radius: 6,
      weight: 2,
      color: '#ffffff',
      fillColor: '#4c8dff',
      fillOpacity: 1,
    })
      .bindTooltip(location.name)
      .addTo(instance)
    map.current = instance
    const owned = layers.current
    return () => {
      owned.clear()
      instance.remove()
      map.current = null
    }
  }, [location.lat, location.lon, location.name])

  // One tile layer per frame, all loaded up front so playback is smooth; only the
  // selected one is visible.
  useEffect(() => {
    const instance = map.current
    if (!instance || !data) return
    const wanted = new Set(frames.map((f) => f.path))
    for (const [path, layer] of layers.current) {
      if (!wanted.has(path)) {
        layer.remove()
        layers.current.delete(path)
      }
    }
    frames.forEach((frame, i) => {
      let layer = layers.current.get(frame.path)
      if (!layer) {
        layer = L.tileLayer(radarTiles(data.host, frame), {
          attribution: RADAR_ATTRIBUTION,
          maxNativeZoom: RADAR_MAX_ZOOM,
          maxZoom: 10,
          opacity: 0,
          zIndex: 10,
        }).addTo(instance)
        layers.current.set(frame.path, layer)
      }
      layer.setOpacity(i === current ? RADAR_OPACITY : 0)
    })
  }, [data, frames, current])

  // Playback steps through the frames and loops.
  useEffect(() => {
    if (!playing || frames.length < 2) return
    const id = setInterval(() => {
      setSelected((s) => ((s ?? frames.length - 1) + 1) % frames.length)
    }, FRAME_MS)
    return () => clearInterval(id)
  }, [playing, frames.length])

  const frame = current >= 0 ? frames[current] : undefined
  const latest = current === frames.length - 1
  const frameLabel = frame
    ? `${formatTime(toLocationTime(new Date(frame.time * 1000).toISOString(), location.utc_offset_seconds))} · ${latest ? 'latest, ' : ''}${minutesAgo(frame.time, nowMs)}`
    : ''

  return (
    <section className="card radar" aria-labelledby="radar-heading">
      <div className="radar-head">
        <h2 id="radar-heading">Rain radar</h2>
        <span className="caption">The past two hours, in 10-minute steps</span>
      </div>
      <div
        ref={container}
        className="radar-map"
        role="region"
        aria-label={`Radar map around ${location.name}; arrow keys pan, plus and minus zoom`}
      />
      {isPending ? (
        <Loading height={48} />
      ) : error ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : frames.length ? (
        <div className="radar-controls">
          <button
            type="button"
            className="button"
            onClick={() => setPlaying((p) => !p)}
            aria-pressed={playing}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            className="radar-scrubber"
            min={0}
            max={frames.length - 1}
            value={current}
            aria-label="Radar time"
            aria-valuetext={frameLabel}
            onChange={(event) => {
              setPlaying(false)
              const value = Number(event.target.value)
              setSelected(value === frames.length - 1 ? null : value)
            }}
          />
          <output className="radar-time" aria-live="off">
            {frameLabel}
          </output>
        </div>
      ) : (
        <p className="caption">No radar frames are available right now.</p>
      )}
      <div className="radar-legend" aria-label="Legend: precipitation intensity">
        <div className="radar-legend-scale" aria-hidden="true">
          {RADAR_LEGEND.map((stop) => (
            <span key={stop.color} style={{ background: stop.color }} />
          ))}
        </div>
        <div className="radar-legend-labels">
          {RADAR_LEGEND.map((stop) => (
            <span key={stop.color}>{stop.label}</span>
          ))}
        </div>
      </div>
      <p className="caption">
        Radar coverage varies: some regions, oceans and remote areas have none. Radar from{' '}
        <a href="https://www.rainviewer.com/">RainViewer</a>.
      </p>
    </section>
  )
}
