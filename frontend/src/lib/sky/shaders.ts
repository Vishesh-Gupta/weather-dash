// GLSL for the sky. Constants come from ../atmosphere so the shader and the CPU
// colour model always agree.

import {
  ATMOSPHERE_RADIUS,
  MIE,
  MIE_G,
  MIE_HEIGHT,
  NIGHT_GLOW,
  PLANET_RADIUS,
  RAYLEIGH,
  RAYLEIGH_HEIGHT,
  SUN_INTENSITY,
  WHITE_BALANCE,
} from '../atmosphere'

/** Size of cloud features on the layer; the renderer aims lightning with the same scale. */
export const CLOUD_SCALE = 1.6

const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`)
const v3 = (v: readonly number[]) => `vec3(${v.map(f).join(', ')})`

/** One triangle covering the viewport. */
export const VERTEX = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const COMMON = /* glsl */ `
const float PI = 3.141592653589793;
const vec3 WHITE_BALANCE = ${v3(WHITE_BALANCE)};

vec3 encodeSrgb(vec3 c) {
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 toneMap(vec3 radiance, float exposure) {
  return encodeSrgb(1.0 - exp(-radiance * WHITE_BALANCE * exposure));
}
`

/**
 * Pass 1: sky radiance for every direction into a small texture (azimuth across,
 * sqrt of elevation down so the horizon gets most of the rows). Re-rendered only
 * when the sun or moon moves.
 */
export const SKY_TEXTURE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform vec3 uSun;
uniform vec3 uMoon;
uniform float uMoonIntensity;
uniform float uExposure;

${COMMON}

const float PLANET = ${f(PLANET_RADIUS)};
const float ATMOSPHERE = ${f(ATMOSPHERE_RADIUS)};
const vec3 RAYLEIGH = ${v3(RAYLEIGH)};
const float MIE = ${f(MIE)};
const float RAYLEIGH_HEIGHT = ${f(RAYLEIGH_HEIGHT)};
const float MIE_HEIGHT = ${f(MIE_HEIGHT)};
const float G = ${f(MIE_G)};
const vec3 NIGHT_GLOW = ${v3(NIGHT_GLOW)};
const vec3 ORIGIN = vec3(0.0, PLANET + 1000.0, 0.0);

vec2 intersect(vec3 origin, vec3 dir, float radius) {
  float b = 2.0 * dot(dir, origin);
  float c = dot(origin, origin) - radius * radius;
  float d = b * b - 4.0 * c;
  if (d < 0.0) return vec2(1e5, -1e5);
  float s = sqrt(d);
  return vec2(-b - s, -b + s) * 0.5;
}

vec3 scatter(vec3 view, vec3 light, float intensity) {
  vec2 hit = intersect(ORIGIN, view, ATMOSPHERE);
  if (hit.x > hit.y) return vec3(0.0);
  vec2 ground = intersect(ORIGIN, view, PLANET);
  float far = (ground.x > 0.0 && ground.x < ground.y) ? min(hit.y, ground.x) : hit.y;
  float start = max(hit.x, 0.0);
  float stepSize = (far - start) / 16.0;

  float mu = dot(view, light);
  float g2 = G * G;
  float phaseRayleigh = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float phaseMie = 3.0 / (8.0 * PI) * ((1.0 - g2) * (mu * mu + 1.0)) /
    (pow(1.0 + g2 - 2.0 * mu * G, 1.5) * (2.0 + g2));

  vec3 rayleigh = vec3(0.0);
  vec3 mie = vec3(0.0);
  float depthRayleigh = 0.0;
  float depthMie = 0.0;
  for (int i = 0; i < 16; i++) {
    vec3 position = ORIGIN + view * (start + stepSize * (float(i) + 0.5));
    float height = length(position) - PLANET;
    float stepRayleigh = exp(-height / RAYLEIGH_HEIGHT) * stepSize;
    float stepMie = exp(-height / MIE_HEIGHT) * stepSize;
    depthRayleigh += stepRayleigh;
    depthMie += stepMie;

    vec2 shadow = intersect(position, light, PLANET);
    if (shadow.x > 0.0 && shadow.x < shadow.y) continue;

    float lightStep = intersect(position, light, ATMOSPHERE).y / 8.0;
    float lightRayleigh = 0.0;
    float lightMie = 0.0;
    for (int j = 0; j < 8; j++) {
      vec3 p = position + light * (lightStep * (float(j) + 0.5));
      float h = length(p) - PLANET;
      lightRayleigh += exp(-h / RAYLEIGH_HEIGHT) * lightStep;
      lightMie += exp(-h / MIE_HEIGHT) * lightStep;
    }
    vec3 attenuation = exp(-(MIE * 1.1 * (depthMie + lightMie) +
      RAYLEIGH * (depthRayleigh + lightRayleigh)));
    rayleigh += stepRayleigh * attenuation;
    mie += stepMie * attenuation;
  }
  return intensity * (phaseRayleigh * RAYLEIGH * rayleigh + phaseMie * MIE * mie);
}

void main() {
  float azimuth = vUv.x * 2.0 * PI;
  float elevation = vUv.y * vUv.y * 0.5 * PI;
  vec3 view = vec3(cos(elevation) * sin(azimuth), sin(elevation), cos(elevation) * cos(azimuth));
  vec3 radiance = scatter(view, uSun, ${f(SUN_INTENSITY)}) +
    scatter(view, uMoon, uMoonIntensity) + NIGHT_GLOW;
  outColor = vec4(toneMap(radiance, uExposure), 1.0);
}
`

/** Pass 2, every frame: sky, sun, moon, stars, clouds, fog and lightning. */
export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSky;
uniform vec2 uResolution;
uniform float uTime;
// Camera: compass bearing and pitch of the view centre, and vertical half field of view.
uniform float uYaw;
uniform float uPitch;
uniform float uHalfFov;

uniform vec3 uSun;
uniform vec3 uMoon;
uniform vec3 uSunlight;
uniform vec3 uMoonlight;
uniform float uMoonPhase;
uniform float uExposure;

uniform float uClouds;
uniform float uOvercast;
uniform float uPrecipitation;
uniform float uDarkness;
uniform float uFog;
uniform vec2 uWind;
uniform vec2 uSeed;
uniform float uFlash;
uniform vec2 uFlashAt;

${COMMON}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// A grey of the same brightness, very slightly cool, like light through cloud.
vec3 greyOf(vec3 c) {
  return vec3(dot(c, LUMA)) * vec3(0.94, 0.97, 1.03);
}

vec3 clearSkyAt(vec3 dir) {
  float azimuth = atan(dir.x, dir.z);
  float elevation = asin(clamp(dir.y, 0.0, 1.0));
  vec2 uv = vec2(fract(azimuth / (2.0 * PI)), sqrt(elevation / (0.5 * PI)));
  return texture(uSky, uv).rgb;
}

// Light reaching a cloud from the sky around it. Clouds scatter all colours
// alike, so it is mostly grey: brightest overhead and towards the horizon.
vec3 cloudAmbient(vec3 dir) {
  vec3 light = clearSkyAt(vec3(0.0, 1.0, 0.0)) * 0.5 +
    clearSkyAt(normalize(vec3(dir.x, 0.15, dir.z))) * 0.55;
  return mix(light, greyOf(light), 0.55);
}

// The sky behind the clouds: clear, or a diffuse grey deck under an overcast.
vec3 skyAt(vec3 dir) {
  vec3 deck = cloudAmbient(dir) * (1.0 - 0.3 * uPrecipitation) *
    mix(0.82, 1.0, smoothstep(0.0, 0.5, dir.y));
  return mix(clearSkyAt(dir), deck, uOvercast);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 u = fract(p);
  u = u * u * (3.0 - 2.0 * u);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(p);
    p = rotate * p * 2.03 + 17.1;
    amplitude *= 0.5;
  }
  return value;
}

// Cloud density at a point on the cloud layer, 0–1.
float cloudDensity(vec2 p) {
  vec2 warp = vec2(fbm(p * 0.5 + 3.1), fbm(p * 0.5 - 7.7));
  float n = fbm(p + warp * 0.45);
  float threshold = mix(0.78, 0.18, uClouds);
  return smoothstep(threshold, threshold + mix(0.18, 0.3, uClouds), n);
}

vec3 viewDirection() {
  vec2 ndc = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;
  float t = tan(uHalfFov);
  vec3 forward = vec3(sin(uYaw) * cos(uPitch), sin(uPitch), cos(uYaw) * cos(uPitch));
  vec3 right = vec3(cos(uYaw), 0.0, -sin(uYaw));
  vec3 up = cross(forward, right);
  return normalize(forward + right * ndc.x * aspect * t + up * ndc.y * t);
}

// A disc of angular radius r around a direction: 1 inside, soft edge.
float disc(vec3 dir, vec3 centre, float r) {
  float angle = acos(clamp(dot(dir, centre), -1.0, 1.0));
  return 1.0 - smoothstep(r * 0.85, r, angle);
}

void main() {
  vec3 dir = viewDirection();
  vec3 sky = skyAt(dir);
  vec3 color = sky;
  float skyBrightness = dot(clearSkyAt(vec3(0.0, 1.0, 0.0)), LUMA);

  // Stars, fixed on the sky, fading out as the sky brightens.
  float starVisibility = clamp(1.0 - skyBrightness * 5.0, 0.0, 1.0) * (1.0 - uFog);
  if (starVisibility > 0.0 && dir.y > 0.0) {
    vec3 cell = floor(dir * 180.0);
    float h = hash13(cell);
    if (h > 0.985) {
      vec3 centre = (cell + vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 4.1))) / 180.0;
      float d = length(dir - normalize(centre)) * 180.0;
      float magnitude = pow((h - 0.985) / 0.015, 3.0);
      float twinkle = 0.85 + 0.15 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
      float extinction = smoothstep(0.0, 0.25, dir.y);
      color += vec3(0.85, 0.9, 1.0) * magnitude * twinkle * extinction * starVisibility *
        exp(-d * d * 28.0) * 1.6;
    }
  }

  // The moon: a sphere lit from the sun's true direction, so its phase and the tilt
  // of the terminator match the real sky.
  float moonRadius = 0.014;
  float moonMask = disc(dir, uMoon, moonRadius);
  if (moonMask > 0.0) {
    vec3 axis = abs(uMoon.y) > 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(axis, uMoon));
    vec3 up = cross(uMoon, right);
    vec2 q = vec2(dot(dir - uMoon, right), dot(dir - uMoon, up)) / moonRadius;
    vec3 normal = normalize(right * q.x + up * q.y - uMoon * sqrt(max(0.0, 1.0 - dot(q, q))));
    float lit = smoothstep(-0.04, 0.12, dot(normal, uSun));
    float maria = 0.78 + 0.22 * smoothstep(0.35, 0.7, fbm(q * 2.2 + 4.0));
    vec3 surface = vec3(0.96, 0.95, 0.9) * maria * (lit + 0.015);
    // In daylight the moon is a pale shape; at night it is bright against the sky.
    float contrast = clamp(1.0 - skyBrightness * 1.6, 0.25, 1.0);
    vec3 moonColor = mix(color + surface * 0.45, surface, contrast);
    color = mix(color, moonColor, moonMask * smoothstep(-0.02, 0.02, uMoon.y));
  }

  // The sun: a limb-darkened disc coloured by the air it shines through, plus glare.
  float sunAngle = acos(clamp(dot(dir, uSun), -1.0, 1.0));
  vec3 sunDisc = toneMap(uSunlight * 60.0, uExposure);
  float limb = sqrt(max(0.0, 1.0 - pow(sunAngle / 0.0085, 2.0)));
  vec3 sunColor = sunDisc * (0.75 + 0.25 * limb) * disc(dir, uSun, 0.0085);
  vec3 glare = toneMap(uSunlight, uExposure) * (exp(-sunAngle * 60.0) * 0.6 + exp(-sunAngle * 12.0) * 0.12);
  float sunVisible = smoothstep(-0.03, 0.0, uSun.y);

  // Clouds on a layer above the viewer; perspective crowds them towards the horizon.
  float density = 0.0;
  vec3 cloudColor = vec3(0.0);
  if (uClouds > 0.01 && dir.y > 0.0) {
    vec2 p = dir.xz / max(dir.y, 0.02) * ${f(CLOUD_SCALE)} + uSeed + uWind * uTime;
    density = cloudDensity(p);
    // Light from the sun's side: a second sample toward the light estimates how much
    // cloud the light crosses before reaching this point.
    vec3 lightDir = uSun.y > -0.1 ? uSun : uMoon;
    float occlusion = cloudDensity(p + normalize(lightDir.xz + 1e-4) * 0.2);
    float lighting = clamp(1.0 - occlusion * 0.75, 0.2, 1.0);
    // An overcast deck blocks most direct light from reaching the clouds below it.
    vec3 direct = toneMap(uSunlight * 2.2 + uMoonlight * 2.2, uExposure) * (1.0 - 0.85 * uOvercast);
    vec3 ambient = cloudAmbient(dir);
    float depth = mix(1.0, 0.6, uDarkness * density);
    cloudColor = (ambient + direct * lighting * 0.75) * depth;
    // Thin edges glow when the sun is behind them (silver lining).
    float forward = pow(max(dot(dir, uSun), 0.0), 10.0) * sunVisible;
    cloudColor += toneMap(uSunlight, uExposure) * forward * (1.0 - density) * 0.9;
    // Distant clouds take on the colour of the air in front of them.
    float distance = smoothstep(0.35, 0.0, dir.y);
    cloudColor = mix(cloudColor, sky, distance * 0.65);
    density *= smoothstep(0.0, 0.06, dir.y);

    // Lightning lights the cloud from inside, strongest near the strike.
    float near = exp(-length(p - uFlashAt) * 0.8);
    cloudColor += vec3(0.8, 0.84, 1.0) * uFlash * (0.35 + near) * density;
  }

  float sunThroughCloud = 1.0 - clamp(density * 1.4, 0.0, 1.0);
  color += (sunColor + glare * (0.4 + 0.6 * sunThroughCloud)) * sunVisible * sunThroughCloud;
  color = mix(color, cloudColor, density);

  // Fog and haze: everything fades towards a grey lit by the sky, most near the horizon.
  vec3 horizon = skyAt(normalize(vec3(dir.x, 0.02, dir.z)));
  vec3 fogColor = mix(horizon, greyOf(horizon) * 1.04, 0.6);
  float haze = clamp(uFog * 1.35, 0.0, 1.0) * (0.6 + 0.4 * (1.0 - clamp(dir.y * 1.5, 0.0, 1.0)));
  color = mix(color, fogColor, haze);

  color += vec3(0.9, 0.92, 1.0) * uFlash * 0.12;
  // Dither to hide banding in smooth gradients.
  color += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`
