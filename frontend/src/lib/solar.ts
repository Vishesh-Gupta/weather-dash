// Where the sun and moon are in a location's sky at a given moment.
//
// Low-precision formulas from Jean Meeus, "Astronomical Algorithms", as used by
// the widely used SunCalc library: about 0.01° for the sun and well under a degree
// for the moon, which is far finer than anything drawn on screen.

const RAD = Math.PI / 180
const DAY_MS = 86_400_000
const J1970 = 2440588
const J2000 = 2451545
// Obliquity of the ecliptic.
const OBLIQUITY = RAD * 23.4397

/** A direction in the sky. */
export interface SkyPosition {
  /** Degrees above the horizon (negative below it). */
  altitude: number
  /** Compass bearing in degrees: 0 north, 90 east, 180 south, 270 west. */
  azimuth: number
}

export interface MoonState extends SkyPosition {
  /** 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
  phase: number
  /** Lit fraction of the disc, 0–1. */
  illumination: number
}

const daysSinceJ2000 = (ms: number) => ms / DAY_MS - 0.5 + J1970 - J2000

function rightAscension(longitude: number, latitude: number) {
  return Math.atan2(
    Math.sin(longitude) * Math.cos(OBLIQUITY) - Math.tan(latitude) * Math.sin(OBLIQUITY),
    Math.cos(longitude),
  )
}

function declination(longitude: number, latitude: number) {
  return Math.asin(
    Math.sin(latitude) * Math.cos(OBLIQUITY) +
      Math.cos(latitude) * Math.sin(OBLIQUITY) * Math.sin(longitude),
  )
}

function siderealTime(days: number, westLongitude: number) {
  return RAD * (280.16 + 360.9856235 * days) - westLongitude
}

function sunCoordinates(days: number) {
  const anomaly = RAD * (357.5291 + 0.98560028 * days)
  const center =
    RAD *
    (1.9148 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly) + 0.0003 * Math.sin(3 * anomaly))
  const longitude = anomaly + center + RAD * 102.9372 + Math.PI
  return {
    rightAscension: rightAscension(longitude, 0),
    declination: declination(longitude, 0),
  }
}

function moonCoordinates(days: number) {
  const meanLongitude = RAD * (218.316 + 13.176396 * days)
  const anomaly = RAD * (134.963 + 13.064993 * days)
  const distanceFromNode = RAD * (93.272 + 13.22935 * days)
  const longitude = meanLongitude + RAD * 6.289 * Math.sin(anomaly)
  const latitude = RAD * 5.128 * Math.sin(distanceFromNode)
  return {
    rightAscension: rightAscension(longitude, latitude),
    declination: declination(longitude, latitude),
    distanceKm: 385001 - 20905 * Math.cos(anomaly),
  }
}

function horizontal(
  hourAngle: number,
  latitude: number,
  dec: number,
): { altitude: number; azimuth: number } {
  const altitude = Math.asin(
    Math.sin(latitude) * Math.sin(dec) + Math.cos(latitude) * Math.cos(dec) * Math.cos(hourAngle),
  )
  // Measured from south, positive towards the west; convert to a compass bearing.
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(dec) * Math.cos(latitude),
  )
  const azimuth = (fromSouth / RAD + 180 + 360) % 360
  return { altitude: altitude / RAD, azimuth }
}

export function sunPosition(ms: number, lat: number, lon: number): SkyPosition {
  const days = daysSinceJ2000(ms)
  const sun = sunCoordinates(days)
  const hourAngle = siderealTime(days, RAD * -lon) - sun.rightAscension
  return horizontal(hourAngle, RAD * lat, sun.declination)
}

export function moonState(ms: number, lat: number, lon: number): MoonState {
  const days = daysSinceJ2000(ms)
  const moon = moonCoordinates(days)
  const sun = sunCoordinates(days)
  const hourAngle = siderealTime(days, RAD * -lon) - moon.rightAscension
  const position = horizontal(hourAngle, RAD * lat, moon.declination)

  // Phase from the sun–moon elongation as seen from Earth.
  const sunDistanceKm = 149_598_000
  const elongation = Math.acos(
    Math.sin(sun.declination) * Math.sin(moon.declination) +
      Math.cos(sun.declination) *
        Math.cos(moon.declination) *
        Math.cos(sun.rightAscension - moon.rightAscension),
  )
  const incidence = Math.atan2(
    sunDistanceKm * Math.sin(elongation),
    moon.distanceKm - sunDistanceKm * Math.cos(elongation),
  )
  const waxing =
    Math.atan2(
      Math.cos(sun.declination) * Math.sin(sun.rightAscension - moon.rightAscension),
      Math.sin(sun.declination) * Math.cos(moon.declination) -
        Math.cos(sun.declination) *
          Math.sin(moon.declination) *
          Math.cos(sun.rightAscension - moon.rightAscension),
    ) < 0
  return {
    ...position,
    illumination: (1 + Math.cos(incidence)) / 2,
    phase: 0.5 + (0.5 * incidence * (waxing ? -1 : 1)) / Math.PI,
  }
}

/**
 * Unit vector for a sky position in a local frame: x east, y up, z north.
 * Shared by the WebGL renderer and the colour model.
 */
export function toVector({ altitude, azimuth }: SkyPosition): [number, number, number] {
  const alt = altitude * RAD
  const az = azimuth * RAD
  return [Math.cos(alt) * Math.sin(az), Math.sin(alt), Math.cos(alt) * Math.cos(az)]
}
