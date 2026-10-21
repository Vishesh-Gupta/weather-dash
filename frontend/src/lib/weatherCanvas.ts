// Animated weather drawn on a full-viewport canvas behind the page: rain, snow,
// drifting clouds, fog banks, stars and lightning. Driven by a WeatherScene.

import type { WeatherScene } from './scene'

type Layer = Pick<
  WeatherScene,
  'rain' | 'snow' | 'clouds' | 'fog' | 'thunder' | 'stars' | 'wind'
> & {
  night: boolean
}

interface Drop {
  x: number
  y: number
  length: number
  speed: number
}

interface Flake {
  x: number
  y: number
  radius: number
  speed: number
  sway: number
  phase: number
}

interface Star {
  x: number
  y: number
  radius: number
  twinkle: number
}

interface Cloud {
  x: number
  y: number
  width: number
  height: number
  speed: number
  alpha: number
}

const MAX_DROPS = 420
const MAX_FLAKES = 260
const MAX_STARS = 160

/** How many particles of each kind suit a viewport of `area` px² (exported for tests). */
export function particleCounts(layer: Layer, area: number) {
  return {
    drops: Math.round(Math.min(MAX_DROPS, (area / 5000) * layer.rain)),
    flakes: Math.round(Math.min(MAX_FLAKES, (area / 9000) * layer.snow)),
    stars: layer.stars ? Math.round(Math.min(MAX_STARS, area / 9000)) : 0,
    clouds: Math.round(layer.clouds * 7),
  }
}

// Deterministic pseudo-random numbers so stars don't jump between renders.
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export class WeatherCanvas {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private layer: Layer | null = null
  private width = 0
  private height = 0
  private drops: Drop[] = []
  private flakes: Flake[] = []
  private stars: Star[] = []
  private clouds: Cloud[] = []
  private frame = 0
  private last = 0
  private nextFlash = 0
  private flash = 0
  private running = false
  private readonly reduceMotion: boolean

  static create(canvas: HTMLCanvasElement): WeatherCanvas | null {
    const ctx = canvas.getContext?.('2d')
    return ctx ? new WeatherCanvas(canvas, ctx) : null
  }

  private constructor(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    this.canvas = canvas
    this.ctx = ctx
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }

  setScene(scene: WeatherScene) {
    const night = scene.clock ? scene.clock.period === 'night' : scene.sky.endsWith('night')
    this.layer = {
      rain: scene.rain,
      snow: scene.snow,
      clouds: scene.clouds,
      fog: scene.fog,
      thunder: scene.thunder,
      stars: scene.stars,
      wind: scene.wind,
      night,
    }
    this.populate()
    if (this.reduceMotion) this.draw(0)
  }

  resize(width: number, height: number) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    this.width = width
    this.height = height
    this.canvas.width = Math.round(width * ratio)
    this.canvas.height = Math.round(height * ratio)
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    this.populate()
    if (!this.running) this.draw(0)
  }

  start() {
    if (this.running || this.reduceMotion) return
    this.running = true
    this.last = performance.now()
    const tick = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      this.step(dt, now)
      this.draw(now)
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  private populate() {
    if (!this.layer || !this.width) return
    const counts = particleCounts(this.layer, this.width * this.height)
    const random = Math.random
    this.drops = Array.from({ length: counts.drops }, () => ({
      x: random() * this.width,
      y: random() * this.height,
      length: 10 + random() * 14,
      speed: 650 + random() * 350,
    }))
    this.flakes = Array.from({ length: counts.flakes }, () => ({
      x: random() * this.width,
      y: random() * this.height,
      radius: 1 + random() * 2.4,
      speed: 25 + random() * 45,
      sway: 10 + random() * 25,
      phase: random() * Math.PI * 2,
    }))
    const rand = seeded(42)
    this.stars = Array.from({ length: counts.stars }, () => ({
      x: rand() * this.width,
      y: rand() * this.height * 0.65,
      radius: 0.4 + rand() * 1.2,
      twinkle: rand() * Math.PI * 2,
    }))
    this.clouds = Array.from({ length: counts.clouds }, (_, i) => ({
      x: rand() * this.width,
      y: this.height * (0.05 + (i % 4) * 0.12 + rand() * 0.08),
      width: this.width * (0.25 + rand() * 0.3),
      height: 60 + rand() * 80,
      speed: 6 + rand() * 10,
      alpha: 0.1 + rand() * 0.12,
    }))
    this.nextFlash = performance.now() + 3000
  }

  private step(dt: number, now: number) {
    const layer = this.layer
    if (!layer) return
    const drift = layer.wind * 260
    for (const drop of this.drops) {
      drop.y += drop.speed * dt
      drop.x += drift * dt
      if (drop.y > this.height) {
        drop.y = -drop.length
        drop.x = Math.random() * this.width
      }
      if (drop.x > this.width) drop.x -= this.width
      if (drop.x < 0) drop.x += this.width
    }
    for (const flake of this.flakes) {
      flake.y += flake.speed * dt
      flake.phase += dt
      flake.x += (layer.wind * 40 + Math.sin(flake.phase) * flake.sway * 0.6) * dt
      if (flake.y > this.height) {
        flake.y = -5
        flake.x = Math.random() * this.width
      }
      if (flake.x > this.width) flake.x -= this.width
      if (flake.x < 0) flake.x += this.width
    }
    const cloudDrift = layer.wind === 0 ? 1 : Math.sign(layer.wind)
    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * cloudDrift * (0.5 + Math.abs(layer.wind)) * dt
      if (cloud.x - cloud.width / 2 > this.width) cloud.x = -cloud.width / 2
      if (cloud.x + cloud.width / 2 < 0) cloud.x = this.width + cloud.width / 2
    }
    if (layer.thunder && now > this.nextFlash) {
      this.flash = 1
      this.nextFlash = now + 5000 + Math.random() * 9000
    }
    this.flash = Math.max(0, this.flash - dt * 3)
  }

  private draw(now: number) {
    const { ctx, layer } = this
    ctx.clearRect(0, 0, this.width, this.height)
    if (!layer) return

    for (const star of this.stars) {
      const alpha = 0.45 + Math.sin(now / 900 + star.twinkle) * 0.35
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`
      ctx.beginPath()
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2)
      ctx.fill()
    }

    const cloudTone = layer.night ? '200, 210, 230' : '255, 255, 255'
    for (const cloud of this.clouds) {
      const gradient = ctx.createRadialGradient(
        cloud.x,
        cloud.y,
        0,
        cloud.x,
        cloud.y,
        cloud.width / 2,
      )
      const alpha = cloud.alpha * (layer.night ? 0.6 : 1)
      gradient.addColorStop(0, `rgba(${cloudTone}, ${alpha})`)
      gradient.addColorStop(1, `rgba(${cloudTone}, 0)`)
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.ellipse(cloud.x, cloud.y, cloud.width / 2, cloud.height / 2, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    if (layer.fog > 0) {
      for (let band = 0; band < 4; band++) {
        const y = this.height * (0.35 + band * 0.18)
        const offset = Math.sin(now / 9000 + band) * 40
        const gradient = ctx.createLinearGradient(0, y - 90, 0, y + 90)
        gradient.addColorStop(0, 'rgba(235, 240, 245, 0)')
        gradient.addColorStop(0.5, `rgba(235, 240, 245, ${(layer.fog * 0.22).toFixed(3)})`)
        gradient.addColorStop(1, 'rgba(235, 240, 245, 0)')
        ctx.fillStyle = gradient
        ctx.fillRect(offset - 60, y - 90, this.width + 120, 180)
      }
    }

    if (this.drops.length) {
      const slant = layer.wind * 0.35
      ctx.strokeStyle = 'rgba(200, 225, 255, 0.5)'
      ctx.lineWidth = 1.2
      ctx.lineCap = 'round'
      ctx.beginPath()
      for (const drop of this.drops) {
        ctx.moveTo(drop.x, drop.y)
        ctx.lineTo(drop.x + drop.length * slant, drop.y + drop.length)
      }
      ctx.stroke()
    }

    if (this.flakes.length) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
      for (const flake of this.flakes) {
        ctx.beginPath()
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(230, 235, 255, ${(this.flash * 0.35).toFixed(3)})`
      ctx.fillRect(0, 0, this.width, this.height)
    }
  }
}
