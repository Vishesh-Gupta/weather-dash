// Physically based sky colour: single Rayleigh and Mie scattering through a
// spherical atmosphere (after Nishita et al. 1993, in the form popularised by
// Rye Terrell's glsl-atmosphere). The same model runs in the WebGL sky shader;
// this CPU copy gives the page its tint, the location cards their skies, and a
// gradient fallback when WebGL is unavailable.

import type { MoonState, SkyPosition } from './solar'
import { toVector } from './solar'

export type Vec3 = [number, number, number]

export const PLANET_RADIUS = 6371e3
export const ATMOSPHERE_RADIUS = 6471e3
export const RAYLEIGH: Vec3 = [5.5e-6, 13.0e-6, 22.4e-6]
export const MIE = 21e-6
export const RAYLEIGH_HEIGHT = 8e3
export const MIE_HEIGHT = 1.2e3
export const MIE_G = 0.758
export const SUN_INTENSITY = 22
/** Moonlight relative to sunlight. Physically ~1/400 000; the eye adapts, so we don't. */
export const MOON_INTENSITY = 0.01
/** Faint airglow and starlight so the darkest night isn't pure black. */
export const NIGHT_GLOW: Vec3 = [0.0025, 0.0035, 0.006]

const ORIGIN: Vec3 = [0, PLANET_RADIUS + 1e3, 0]
const PRIMARY_STEPS = 16
const LIGHT_STEPS = 8

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]
const length = (a: Vec3) => Math.sqrt(dot(a, a))
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

export function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Ray–sphere intersection distances (near, far); near > far means a miss. */
function intersect(origin: Vec3, dir: Vec3, radius: number): [number, number] {
  const b = 2 * dot(dir, origin)
  const c = dot(origin, origin) - radius * radius
  const d = b * b - 4 * c
  if (d < 0) return [1e5, -1e5]
  const s = Math.sqrt(d)
  return [(-b - s) / 2, (-b + s) / 2]
}

/** Light scattered towards the viewer along `view` from a light source in direction `light`. */
export function scatter(view: Vec3, light: Vec3, intensity: number): Vec3 {
  const [near, far] = intersect(ORIGIN, view, ATMOSPHERE_RADIUS)
  if (near > far) return [0, 0, 0]
  const ground = intersect(ORIGIN, view, PLANET_RADIUS)
  const end = ground[0] > 0 && ground[0] < ground[1] ? Math.min(far, ground[0]) : far
  const step = (end - Math.max(near, 0)) / PRIMARY_STEPS

  const mu = dot(view, light)
  const g2 = MIE_G * MIE_G
  const phaseRayleigh = (3 / (16 * Math.PI)) * (1 + mu * mu)
  const phaseMie =
    ((3 / (8 * Math.PI)) * ((1 - g2) * (mu * mu + 1))) /
    (Math.pow(1 + g2 - 2 * mu * MIE_G, 1.5) * (2 + g2))

  const rayleigh: Vec3 = [0, 0, 0]
  const mie: Vec3 = [0, 0, 0]
  let depthRayleigh = 0
  let depthMie = 0
  for (let i = 0; i < PRIMARY_STEPS; i++) {
    const position = add(ORIGIN, view, Math.max(near, 0) + step * (i + 0.5))
    const height = length(position) - PLANET_RADIUS
    const stepRayleigh = Math.exp(-height / RAYLEIGH_HEIGHT) * step
    const stepMie = Math.exp(-height / MIE_HEIGHT) * step
    depthRayleigh += stepRayleigh
    depthMie += stepMie

    // Points in the Earth's shadow receive no direct light: this is what makes twilight.
    const shadow = intersect(position, light, PLANET_RADIUS)
    if (shadow[0] > 0 && shadow[0] < shadow[1]) continue

    const lightStep = intersect(position, light, ATMOSPHERE_RADIUS)[1] / LIGHT_STEPS
    let lightRayleigh = 0
    let lightMie = 0
    for (let j = 0; j < LIGHT_STEPS; j++) {
      const p = add(position, light, lightStep * (j + 0.5))
      const h = length(p) - PLANET_RADIUS
      lightRayleigh += Math.exp(-h / RAYLEIGH_HEIGHT) * lightStep
      lightMie += Math.exp(-h / MIE_HEIGHT) * lightStep
    }
    for (let c = 0; c < 3; c++) {
      const attenuation = Math.exp(
        -(MIE * 1.1 * (depthMie + lightMie) + RAYLEIGH[c]! * (depthRayleigh + lightRayleigh)),
      )
      rayleigh[c]! += stepRayleigh * attenuation
      mie[c]! += stepMie * attenuation
    }
  }
  return [0, 1, 2].map(
    (c) => intensity * (phaseRayleigh * RAYLEIGH[c]! * rayleigh[c]! + phaseMie * MIE * mie[c]!),
  ) as Vec3
}

/** Colour of direct light from a source after crossing the atmosphere (0 below the horizon). */
export function transmittance(light: Vec3): Vec3 {
  const ground = intersect(ORIGIN, light, PLANET_RADIUS)
  if (ground[0] > 0 && ground[0] < ground[1]) return [0, 0, 0]
  const far = intersect(ORIGIN, light, ATMOSPHERE_RADIUS)[1]
  const step = far / PRIMARY_STEPS
  let depthRayleigh = 0
  let depthMie = 0
  for (let i = 0; i < PRIMARY_STEPS; i++) {
    const h = length(add(ORIGIN, light, step * (i + 0.5))) - PLANET_RADIUS
    depthRayleigh += Math.exp(-h / RAYLEIGH_HEIGHT) * step
    depthMie += Math.exp(-h / MIE_HEIGHT) * step
  }
  return RAYLEIGH.map((k) => Math.exp(-(k * depthRayleigh + MIE * 1.1 * depthMie))) as Vec3
}

/**
 * Exposure for a scene of a given brightness, like an eye or camera adapting:
 * bright days are held back, dusk and moonlight are lifted (within limits).
 */
export function exposureFor(luminance: number): number {
  return clamp(0.35 / Math.sqrt(luminance + 1e-5), 0.6, 2.6)
}

/**
 * Daylight white balance. Single scattering leaves out light scattered more than
 * once, which reads greenish; a camera balanced for daylight sees the sky bluer.
 */
export const WHITE_BALANCE: Vec3 = [0.75, 0.95, 1.7]

/** Linear 0–1 to sRGB-encoded 0–1. */
export const encodeSrgb = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055

/** Map scene radiance to display (sRGB) values 0–1: white balance, exposure, roll-off. */
export const toneMap = (c: Vec3, exposure: number): Vec3 =>
  c.map((v, i) => encodeSrgb(1 - Math.exp(-v * WHITE_BALANCE[i]! * exposure))) as Vec3

export const luminance = (c: Vec3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

export interface SkyLight {
  sun: Vec3
  moon: Vec3
  /** Sunlight and moonlight colour after crossing the atmosphere, scaled by strength. */
  sunlight: Vec3
  moonlight: Vec3
  exposure: number
  moonIntensity: number
}

/** Light sources and camera exposure for a moment, from the sun and moon positions. */
export function skyLight(sun: SkyPosition, moon: MoonState): SkyLight {
  const sunDir = toVector(sun)
  const moonDir = toVector(moon)
  const moonIntensity = SUN_INTENSITY * MOON_INTENSITY * moon.illumination
  const zenith: Vec3 = [0, 1, 0]
  const brightness =
    luminance(scatter(zenith, sunDir, SUN_INTENSITY)) +
    luminance(scatter(zenith, moonDir, moonIntensity)) +
    luminance(NIGHT_GLOW)
  return {
    sun: sunDir,
    moon: moonDir,
    sunlight: transmittance(sunDir),
    moonlight: transmittance(moonDir).map(
      (v) => v * MOON_INTENSITY * moon.illumination * 6,
    ) as Vec3,
    exposure: exposureFor(brightness),
    moonIntensity,
  }
}

/** Clear-sky radiance in a direction, before exposure and tone mapping. */
export function clearSky(view: Vec3, light: SkyLight): Vec3 {
  const fromSun = scatter(view, light.sun, SUN_INTENSITY)
  const fromMoon = scatter(view, light.moon, light.moonIntensity)
  return add(add(fromSun, fromMoon), NIGHT_GLOW)
}

export interface Weather {
  /** Cloud cover 0–1. */
  clouds: number
  /** Precipitation intensity 0–1 (rain or snow). */
  precipitation: number
  /** Fog or haze 0–1. */
  fog: number
}

/** How much the weather greys out the sky, 0 (clear) to 1 (heavy overcast). */
export function overcastFor(weather: Weather): number {
  return clamp(clamp((weather.clouds - 0.45) / 0.5) * 0.85 + weather.precipitation * 0.35)
}

export interface SkyPalette {
  /** Top of the sky, horizon, and the sun's side of the horizon, as display colours. */
  zenith: string
  horizon: string
  glow: string
  /** Relative brightness of the scene 0–1, for choosing overlays. */
  brightness: number
}

const toHex = (c: Vec3) =>
  '#' +
  c
    .map((v) =>
      Math.round(clamp(v) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

/** Mix a display colour towards a grey of the same brightness, then darken for heavy weather. */
function weathered(c: Vec3, overcast: number, weather: Weather): Vec3 {
  const grey = luminance(c) * (1 - 0.35 * weather.precipitation)
  const tint: Vec3 = [grey * 0.92, grey * 0.96, grey * 1.04]
  const mixed = c.map((v, i) => v + (tint[i]! - v) * overcast) as Vec3
  const fogGrey = Math.max(grey, 0.05) * 1.1
  return mixed.map((v) => v + (fogGrey - v) * weather.fog * 0.6) as Vec3
}

/** The sky's colours for a moment and its weather, for CSS. */
export function skyPalette(sun: SkyPosition, moon: MoonState, weather: Weather): SkyPalette {
  const light = skyLight(sun, moon)
  const overcast = overcastFor(weather)
  const sample = (view: Vec3) =>
    weathered(toneMap(clearSky(normalize(view), light), light.exposure), overcast, weather)

  // Horizon samples a little above the horizon, facing away from and towards the sun.
  const [sx, , sz] = light.sun
  const flat = normalize([sx, 0, sz])
  const zenith = sample([0, 1, 0])
  const horizon = sample([-flat[0], 0.08, -flat[2]])
  const glow = sample([flat[0], 0.06, flat[2]])
  return {
    zenith: toHex(zenith),
    horizon: toHex(horizon),
    glow: toHex(glow),
    brightness: clamp(luminance(zenith) * 0.6 + luminance(glow) * 0.4),
  }
}
