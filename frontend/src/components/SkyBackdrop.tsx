import { useEffect, useRef } from 'react'

import { arcPoint } from '../lib/astro'
import type { WeatherScene } from '../lib/scene'
import { WeatherCanvas } from '../lib/weatherCanvas'
import { Moon } from './Moon'

/** Full-page sky: gradient (on the parent), the sun or moon, and animated weather. */
export function SkyBackdrop({ scene }: { scene: WeatherScene | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<WeatherCanvas | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = WeatherCanvas.create(canvas)
    if (!renderer) return
    rendererRef.current = renderer
    const resize = () => renderer.resize(window.innerWidth, window.innerHeight)
    const visibility = () => (document.hidden ? renderer.stop() : renderer.start())
    resize()
    renderer.start()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      renderer.stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibility)
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    if (scene) rendererRef.current?.setScene(scene)
  }, [scene])

  const clock = scene?.clock
  // The sun or moon rides a wide arc across the top of the page.
  const body = clock ? arcPoint(clock.progress, 100, 100, 6) : null
  const hidden =
    !scene || scene.clouds > 0.85 || scene.fog > 0.6 || scene.rain > 0.4 || scene.snow > 0.4

  return (
    <div className="sky-backdrop" aria-hidden="true">
      {body && clock && !hidden ? (
        <div
          className={clock.period === 'day' ? 'sky-sun' : 'sky-moon'}
          style={{ left: `${body.x}%`, top: `${8 + body.y * 0.28}%` }}
        >
          {clock.period === 'night' ? <Moon phase={scene.moon.phase} size={56} /> : null}
        </div>
      ) : null}
      <canvas ref={canvasRef} className="sky-canvas" />
    </div>
  )
}
