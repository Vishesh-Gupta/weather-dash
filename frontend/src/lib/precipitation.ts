// Falling rain and snow, drawn on a canvas over the sky. Particles sit at random
// depths: near drops are longer, brighter and faster than distant ones, so the
// rain has the depth of a real shower rather than a flat pattern.

import type { WeatherScene } from './scene'

type Fall = Pick<WeatherScene, 'rain' | 'snow' | 'wind' | 'night'>

interface Particle {
  x: number
  y: number
  /** 0 far … 1 near. */
  depth: number
  phase: number
}

const MAX_DROPS = 700
const MAX_FLAKES = 420

/** How many particles suit a viewport of `area` px² (exported for tests). */
export function particleCounts(fall: Pick<Fall, 'rain' | 'snow'>, area: number) {
  return {
    drops: Math.round(Math.min(MAX_DROPS, (area / 2600) * fall.rain)),
    flakes: Math.round(Math.min(MAX_FLAKES, (area / 5200) * fall.snow)),
  }
}

/** A soft round flake, pre-rendered once and scaled per particle. */
function flakeSprite(): HTMLCanvasElement | null {
  const sprite = document.createElement('canvas')
  sprite.width = sprite.height = 32
  const ctx = sprite.getContext?.('2d')
  if (!ctx) return null
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.75)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)
  return sprite
}

export class Precipitation {
  private readonly ctx: CanvasRenderingContext2D
  private readonly sprite: HTMLCanvasElement | null
  private readonly reduceMotion: boolean
  private fall: Fall | null = null
  private width = 0
  private height = 0
  private drops: Particle[] = []
  private flakes: Particle[] = []
  private frame = 0
  private last = 0
  private running = false

  static create(canvas: HTMLCanvasElement): Precipitation | null {
    const ctx = canvas.getContext?.('2d')
    return ctx ? new Precipitation(canvas, ctx) : null
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
  ) {
    this.ctx = ctx
    this.sprite = flakeSprite()
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }

  setScene(scene: Fall) {
    const changed = !this.fall || this.fall.rain !== scene.rain || this.fall.snow !== scene.snow
    this.fall = { rain: scene.rain, snow: scene.snow, wind: scene.wind, night: scene.night }
    if (changed) this.populate()
    this.sync()
  }

  resize(width: number, height: number) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.width = width
    this.height = height
    this.canvas.width = Math.round(width * ratio)
    this.canvas.height = Math.round(height * ratio)
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.populate()
    this.draw()
  }

  /** Run only while something is falling and the page is visible. */
  start() {
    this.running = true
    this.sync()
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private get active() {
    return this.drops.length + this.flakes.length > 0
  }

  private sync() {
    if (!this.running || this.reduceMotion || !this.active) {
      cancelAnimationFrame(this.frame)
      this.frame = 0
      this.draw()
      return
    }
    if (this.frame) return
    this.last = performance.now()
    // Every display refresh (120 Hz where the screen supports it), moved by the real
    // time elapsed so speeds are the same at any refresh rate.
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.step(dt)
      this.draw()
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private populate() {
    if (!this.fall || !this.width) return
    const counts = particleCounts(this.fall, this.width * this.height)
    const make = (): Particle => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      // More distant particles than near ones, as in a real volume of rain.
      depth: Math.pow(Math.random(), 1.6),
      phase: Math.random() * Math.PI * 2,
    })
    this.drops = Array.from({ length: counts.drops }, make)
    this.flakes = Array.from({ length: counts.flakes }, make)
  }

  private step(dt: number) {
    const fall = this.fall
    if (!fall) return
    const wrap = (p: Particle, margin: number) => {
      if (p.y > this.height + margin) {
        p.y = -margin
        p.x = Math.random() * this.width
      }
      if (p.x > this.width + margin) p.x -= this.width + margin * 2
      if (p.x < -margin) p.x += this.width + margin * 2
    }
    for (const drop of this.drops) {
      const speed = 900 + drop.depth * 1500
      drop.y += speed * dt
      drop.x += fall.wind * speed * 0.3 * dt
      wrap(drop, 60)
    }
    for (const flake of this.flakes) {
      const speed = 22 + flake.depth * 60
      flake.phase += dt * (0.8 + flake.depth)
      flake.y += speed * dt
      flake.x += (fall.wind * 70 + Math.sin(flake.phase) * (8 + flake.depth * 18)) * dt
      wrap(flake, 10)
    }
  }

  private draw() {
    const { ctx, fall } = this
    ctx.clearRect(0, 0, this.width, this.height)
    if (!fall) return

    if (this.drops.length) {
      // Rain picks up the light of the sky behind it: pale by day, dim at night.
      const tone = fall.night ? '170, 182, 205' : '220, 228, 238'
      const intensity = 0.55 + fall.rain * 0.45
      ctx.lineCap = 'round'
      // Three depth bands, each stroked in one pass.
      for (const [lo, hi] of [
        [0, 0.33],
        [0.33, 0.66],
        [0.66, 1.01],
      ] as const) {
        const mid = (lo + hi) / 2
        ctx.strokeStyle = `rgba(${tone}, ${((0.07 + mid * 0.2) * intensity).toFixed(3)})`
        ctx.lineWidth = 0.6 + mid * 1.1
        ctx.beginPath()
        for (const drop of this.drops) {
          if (drop.depth < lo || drop.depth >= hi) continue
          const length = (12 + drop.depth * 34) * (0.7 + fall.rain * 0.5)
          ctx.moveTo(drop.x, drop.y)
          ctx.lineTo(drop.x - fall.wind * length * 0.3, drop.y - length)
        }
        ctx.stroke()
      }
    }

    if (this.flakes.length && this.sprite) {
      for (const flake of this.flakes) {
        const size = 2 + flake.depth * 7
        ctx.globalAlpha = 0.35 + flake.depth * 0.55
        ctx.drawImage(this.sprite, flake.x - size / 2, flake.y - size / 2, size, size)
      }
      ctx.globalAlpha = 1
    }
  }
}
