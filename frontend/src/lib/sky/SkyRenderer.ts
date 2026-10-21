// Draws a physically based sky into a canvas with WebGL 2: atmosphere from the
// real sun and moon positions, clouds from reported cover, haze from visibility.

import type { WeatherScene } from '../scene'
import { FramePacer } from './pacer'
import { CLOUD_SCALE, COMPOSITE, SKY_TEXTURE, VERTEX } from './shaders'

const SKY_TEXTURE_SIZE = [512, 128] as const
/** Half the vertical field of view, like a phone camera held in landscape. */
const HALF_FOV = (34 * Math.PI) / 180
/** The bottom edge sits just above the horizon. */
const PITCH = HALF_FOV + 0.01
const RAD = Math.PI / 180

type Uniforms = Record<string, WebGLUniformLocation | null>

function compile(gl: WebGL2RenderingContext, vertex: string, fragment: string) {
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(`Sky shader failed to compile: ${gl.getShaderInfoLog(shader)}`)
    }
    gl.attachShader(program, shader)
  }
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Sky shader failed to link: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

function uniforms(gl: WebGL2RenderingContext, program: WebGLProgram, names: string[]): Uniforms {
  return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, name)]))
}

/** Lightning: two quick pulses, like a real stroke and its return. */
export function flashAt(elapsedMs: number): number {
  const pulse = (start: number, width: number) =>
    elapsedMs < start ? 0 : Math.exp(-((elapsedMs - start) / width))
  return Math.min(1, pulse(0, 60) + 0.6 * pulse(160, 90))
}

export class SkyRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly skyProgram: WebGLProgram
  private readonly compositeProgram: WebGLProgram
  private readonly skyUniforms: Uniforms
  private readonly compositeUniforms: Uniforms
  private readonly skyTexture: WebGLTexture
  private readonly framebuffer: WebGLFramebuffer
  private readonly reduceMotion: boolean
  private scene: WeatherScene | null = null
  private skyKey = ''
  private frame = 0
  private running = false
  private readonly startedAt = performance.now()
  private nextFlash = 0
  private flashStarted = -1e9
  private flashTarget: [number, number] = [0, 0]
  private readonly pacer = new FramePacer()
  /** GPU timer queries, where the browser offers them (Chrome on desktop). */
  private readonly timer: TimerQueryExtension | null
  private readonly queries: WebGLQuery[] = []
  private size: [number, number] = [0, 0]

  static create(canvas: HTMLCanvasElement): SkyRenderer | null {
    const gl = canvas.getContext?.('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    })
    if (!gl) return null
    try {
      return new SkyRenderer(canvas, gl)
    } catch (error) {
      console.warn(error)
      return null
    }
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.gl = gl
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExtension | null
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    this.skyProgram = compile(gl, VERTEX, SKY_TEXTURE)
    this.compositeProgram = compile(gl, VERTEX, COMPOSITE)
    this.skyUniforms = uniforms(gl, this.skyProgram, [
      'uSun',
      'uMoon',
      'uMoonIntensity',
      'uExposure',
    ])
    this.compositeUniforms = uniforms(gl, this.compositeProgram, [
      'uSky',
      'uResolution',
      'uTime',
      'uYaw',
      'uPitch',
      'uHalfFov',
      'uSun',
      'uMoon',
      'uSunlight',
      'uMoonlight',
      'uMoonPhase',
      'uExposure',
      'uClouds',
      'uOvercast',
      'uPrecipitation',
      'uDarkness',
      'uFog',
      'uWind',
      'uSeed',
      'uFlash',
      'uFlashAt',
    ])

    // A single triangle that covers the screen.
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.skyTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.skyTexture)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      SKY_TEXTURE_SIZE[0],
      SKY_TEXTURE_SIZE[1],
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.skyTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  setScene(scene: WeatherScene) {
    this.scene = scene
    const { sun, moon, exposure, moonIntensity } = scene.light
    const key = [...sun, ...moon, exposure, moonIntensity].map((v) => v.toFixed(4)).join()
    if (key !== this.skyKey) {
      this.skyKey = key
      this.renderSkyTexture()
    }
    if (!scene.thunder) this.flashStarted = -1e9
    if (!this.running) this.draw(performance.now())
  }

  /**
   * Size in CSS pixels. The sky is soft, so it starts at reduced resolution; the
   * pacer raises it towards full device pixels when the GPU has room.
   */
  resize(width: number, height: number) {
    this.size = [width, height]
    const base = Math.min(0.6, Math.max(0.35, 700 / Math.max(height, 1)))
    this.pacer.maxQuality = Math.max(1, Math.min(window.devicePixelRatio || 1, 2) / base)
    const scale = base * this.pacer.quality
    this.canvas.width = Math.max(1, Math.round(width * scale))
    this.canvas.height = Math.max(1, Math.round(height * scale))
    if (!this.running) this.draw(performance.now())
  }

  start() {
    if (this.running || this.reduceMotion) return
    this.running = true
    this.pacer.reset()
    const tick = (now: number) => {
      if (!this.running) return
      const { draw, resized } = this.pacer.tick(now)
      if (resized) this.resize(...this.size)
      if (draw) this.draw(now)
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.frame)
  }

  private renderSkyTexture() {
    const { gl, scene } = this
    if (!scene) return
    const { sun, moon, exposure, moonIntensity } = scene.light
    gl.useProgram(this.skyProgram)
    gl.uniform3fv(this.skyUniforms.uSun!, sun)
    gl.uniform3fv(this.skyUniforms.uMoon!, moon)
    gl.uniform1f(this.skyUniforms.uMoonIntensity!, moonIntensity)
    gl.uniform1f(this.skyUniforms.uExposure!, exposure)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer)
    gl.viewport(0, 0, SKY_TEXTURE_SIZE[0], SKY_TEXTURE_SIZE[1])
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Face the sun by day (or the moon by night), keeping it right of centre. */
  private camera(scene: WeatherScene) {
    const aspect = this.canvas.width / this.canvas.height
    const target = scene.sun.altitude > -6 || scene.moon.altitude < 0 ? scene.sun : scene.moon
    const offset = Math.atan(0.3 * aspect * Math.tan(HALF_FOV))
    return { yaw: target.azimuth * RAD - offset, pitch: PITCH }
  }

  private lightning(now: number, scene: WeatherScene, yaw: number): number {
    if (!scene.thunder || this.reduceMotion) return 0
    if (now >= this.nextFlash) {
      this.flashStarted = now
      this.nextFlash = now + 6000 + Math.random() * 12_000
      // Somewhere in the visible part of the cloud layer.
      const bearing = yaw + (Math.random() - 0.5) * 1.2
      const distance = 1 + Math.random() * 3
      this.flashTarget = [Math.sin(bearing) * distance, Math.cos(bearing) * distance]
    }
    return flashAt(now - this.flashStarted)
  }

  private draw(now: number) {
    const { gl, scene } = this
    if (!scene) return
    const u = this.compositeUniforms
    const { yaw, pitch } = this.camera(scene)
    const time = this.reduceMotion ? 0 : (now - this.startedAt) / 1000

    // Clouds drift with the wind: a few hundredths of the layer per minute.
    const toward = scene.windToward * RAD
    const drift = 0.0012 + Math.min(scene.windSpeed, 25) * 0.0005
    const wind: [number, number] = [-Math.sin(toward) * drift, -Math.cos(toward) * drift]
    const overcast = Math.max(0, (scene.clouds - 0.5) * 2)
    const darkness = Math.min(1, Math.max(scene.rain, scene.snow * 0.6) + overcast * 0.35)
    const flash = this.lightning(now, scene, yaw)

    gl.useProgram(this.compositeProgram)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.skyTexture)
    gl.uniform1i(u.uSky!, 0)
    gl.uniform2f(u.uResolution!, this.canvas.width, this.canvas.height)
    gl.uniform1f(u.uTime!, time)
    gl.uniform1f(u.uYaw!, yaw)
    gl.uniform1f(u.uPitch!, pitch)
    gl.uniform1f(u.uHalfFov!, HALF_FOV)
    gl.uniform3fv(u.uSun!, scene.light.sun)
    gl.uniform3fv(u.uMoon!, scene.light.moon)
    gl.uniform3fv(u.uSunlight!, scene.light.sunlight)
    gl.uniform3fv(u.uMoonlight!, scene.light.moonlight)
    gl.uniform1f(u.uMoonPhase!, scene.moon.phase)
    gl.uniform1f(u.uExposure!, scene.light.exposure)
    gl.uniform1f(u.uClouds!, scene.clouds)
    gl.uniform1f(u.uOvercast!, scene.overcast)
    gl.uniform1f(u.uPrecipitation!, Math.max(scene.rain, scene.snow))
    gl.uniform1f(u.uDarkness!, darkness)
    gl.uniform1f(u.uFog!, scene.fog)
    gl.uniform2fv(u.uWind!, wind)
    gl.uniform2fv(u.uSeed!, scene.seed)
    gl.uniform1f(u.uFlash!, flash)
    // Same mapping as the cloud layer in the shader, so the strike lights a patch of cloud.
    const [fx, fz] = this.flashTarget
    gl.uniform2f(
      u.uFlashAt!,
      fx * CLOUD_SCALE + scene.seed[0] + wind[0] * time,
      fz * CLOUD_SCALE + scene.seed[1] + wind[1] * time,
    )
    this.timed(() => gl.drawArrays(gl.TRIANGLES, 0, 3))
  }

  /**
   * Run a draw inside a GPU timer query and pass finished timings to the pacer.
   * Results arrive a few frames later and are read without waiting on the GPU.
   */
  private timed(drawCall: () => void) {
    const { gl, timer, queries } = this
    if (!timer || !this.running) return drawCall()
    while (queries.length) {
      const query = queries[0]!
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break
      // A disjoint reading (the GPU changed clocks or was interrupted) is meaningless.
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        this.pacer.recordGpuTime(gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6)
      }
      gl.deleteQuery(query)
      queries.shift()
    }
    // Don't pile up queries on a GPU that never answers.
    if (queries.length >= 8) return drawCall()
    const query = gl.createQuery()
    gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
    drawCall()
    gl.endQuery(timer.TIME_ELAPSED_EXT)
    queries.push(query)
  }
}

interface TimerQueryExtension {
  TIME_ELAPSED_EXT: GLenum
  GPU_DISJOINT_EXT: GLenum
}
