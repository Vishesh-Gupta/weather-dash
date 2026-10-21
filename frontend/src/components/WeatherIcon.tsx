import type { Sky } from '../lib/sky'

// Hand-drawn 64×64 icons. Colors are fixed so they read on any sky background;
// gentle motion is disabled for viewers who prefer reduced motion (see styles.css).

const SUN = '#ffc53d'
const MOON = '#f4f1e1'
const CLOUD = '#f4f7fb'
const CLOUD_DARK = '#c9d3de'
const RAIN = '#8cc8ff'
const SNOW = '#ffffff'
const BOLT = '#ffd84d'

function Sun({ cx = 32, cy = 32, r = 11 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <g className="wx-sun">
      <g className="wx-rays" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * (r + 5)}
              y1={cy + Math.sin(a) * (r + 5)}
              x2={cx + Math.cos(a) * (r + 10)}
              y2={cy + Math.sin(a) * (r + 10)}
              stroke={SUN}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )
        })}
      </g>
      <circle cx={cx} cy={cy} r={r} fill={SUN} />
    </g>
  )
}

function Moon({ cx = 32, cy = 30, r = 12 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <path
      d={`M ${cx + r * 0.3} ${cy - r} A ${r} ${r} 0 1 0 ${cx + r} ${cy + r * 0.45} A ${r * 0.85} ${r * 0.85} 0 0 1 ${cx + r * 0.3} ${cy - r} Z`}
      fill={MOON}
    />
  )
}

function Cloud({
  x = 0,
  y = 0,
  scale = 1,
  fill = CLOUD,
}: {
  x?: number
  y?: number
  scale?: number
  fill?: string
}) {
  return (
    <path
      className="wx-cloud"
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M18 46h30a10 10 0 0 0 0-20 14 14 0 0 0-27-3 9 9 0 0 0-3 23z"
      fill={fill}
    />
  )
}

function Drops({ snow = false, count = 3 }: { snow?: boolean; count?: number }) {
  return (
    <g className={snow ? 'wx-snow' : 'wx-rain'}>
      {Array.from({ length: count }, (_, i) => {
        const x = 22 + i * 10
        return snow ? (
          <circle
            key={i}
            cx={x}
            cy={54}
            r={2.6}
            fill={SNOW}
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        ) : (
          <line
            key={i}
            x1={x}
            y1={50}
            x2={x - 3}
            y2={58}
            stroke={RAIN}
            strokeWidth={3}
            strokeLinecap="round"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        )
      })}
    </g>
  )
}

function Mist() {
  return (
    <g className="wx-mist" stroke={CLOUD} strokeWidth={3.5} strokeLinecap="round">
      <line x1={14} y1={28} x2={50} y2={28} />
      <line x1={10} y1={37} x2={46} y2={37} opacity={0.85} />
      <line x1={18} y1={46} x2={54} y2={46} opacity={0.7} />
    </g>
  )
}

const LABELS: Record<Sky, string> = {
  'clear-day': 'Clear',
  'clear-night': 'Clear night',
  'partly-day': 'Partly cloudy',
  'partly-night': 'Partly cloudy night',
  'clouds-day': 'Cloudy',
  'clouds-night': 'Cloudy night',
  drizzle: 'Drizzle',
  rain: 'Rain',
  thunder: 'Thunderstorm',
  snow: 'Snow',
  mist: 'Mist or fog',
}

export function WeatherIcon({
  sky,
  size = 64,
  title,
}: {
  sky: Sky
  size?: number
  title?: string
}) {
  const label = title ?? LABELS[sky]
  let body
  switch (sky) {
    case 'clear-day':
      body = <Sun />
      break
    case 'clear-night':
      body = <Moon />
      break
    case 'partly-day':
      body = (
        <>
          <Sun cx={24} cy={22} r={9} />
          <Cloud x={6} y={6} />
        </>
      )
      break
    case 'partly-night':
      body = (
        <>
          <Moon cx={22} cy={20} r={10} />
          <Cloud x={6} y={6} />
        </>
      )
      break
    case 'clouds-day':
    case 'clouds-night':
      body = (
        <>
          <Cloud x={-4} y={-8} scale={0.8} fill={CLOUD_DARK} />
          <Cloud x={4} y={2} />
        </>
      )
      break
    case 'drizzle':
      body = (
        <>
          <Cloud y={-6} />
          <Drops count={2} />
        </>
      )
      break
    case 'rain':
      body = (
        <>
          <Cloud y={-6} fill={CLOUD_DARK} />
          <Drops />
        </>
      )
      break
    case 'thunder':
      body = (
        <>
          <Cloud y={-8} fill={CLOUD_DARK} />
          <path className="wx-bolt" d="M34 38 l-8 12 h6 l-4 10 l12 -15 h-6 l4 -7z" fill={BOLT} />
        </>
      )
      break
    case 'snow':
      body = (
        <>
          <Cloud y={-6} />
          <Drops snow />
        </>
      )
      break
    case 'mist':
      body = <Mist />
      break
  }
  return (
    <svg
      className="wx-icon"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {body}
    </svg>
  )
}
