import { useEffect, useRef, useState } from 'react'

import { Precipitation } from '../lib/precipitation'
import type { WeatherScene } from '../lib/scene'
import { SkyRenderer } from '../lib/sky/SkyRenderer'

/**
 * Full-page sky behind the content. WebGL draws the atmosphere, sun, moon, stars
 * and clouds; a 2D canvas adds rain and snow. Without WebGL, the CSS gradient on
 * this element (from the same colour model) shows instead.
 */
export function SkyBackdrop({ scene }: { scene: WeatherScene | null }) {
  const skyRef = useRef<HTMLCanvasElement>(null)
  const fallRef = useRef<HTMLCanvasElement>(null)
  const skyRenderer = useRef<SkyRenderer | null>(null)
  const fallRenderer = useRef<Precipitation | null>(null)
  const [webgl, setWebgl] = useState(false)

  useEffect(() => {
    const skyCanvas = skyRef.current
    const fallCanvas = fallRef.current
    if (!skyCanvas || !fallCanvas) return
    const sky = SkyRenderer.create(skyCanvas)
    const fall = Precipitation.create(fallCanvas)
    skyRenderer.current = sky
    fallRenderer.current = fall
    // Whether WebGL works is only known once the canvas exists.
    setWebgl(sky !== null)

    const resize = () => {
      sky?.resize(window.innerWidth, window.innerHeight)
      fall?.resize(window.innerWidth, window.innerHeight)
    }
    const visibility = () => {
      if (document.hidden) {
        sky?.stop()
        fall?.stop()
      } else {
        sky?.start()
        fall?.start()
      }
    }
    const lost = (event: Event) => {
      event.preventDefault()
      sky?.stop()
      skyRenderer.current = null
      setWebgl(false)
    }
    resize()
    visibility()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', visibility)
    skyCanvas.addEventListener('webglcontextlost', lost)
    return () => {
      sky?.stop()
      fall?.stop()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', visibility)
      skyCanvas.removeEventListener('webglcontextlost', lost)
      skyRenderer.current = null
      fallRenderer.current = null
    }
  }, [])

  useEffect(() => {
    if (!scene) return
    skyRenderer.current?.setScene(scene)
    fallRenderer.current?.setScene(scene)
  }, [scene, webgl])

  return (
    <div className="sky-backdrop" aria-hidden="true" data-renderer={webgl ? 'webgl' : 'css'}>
      <canvas ref={skyRef} className="sky-canvas" hidden={!webgl} />
      <canvas ref={fallRef} className="sky-precipitation" />
    </div>
  )
}
