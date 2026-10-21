import type { ReactNode } from 'react'

import type { Sky } from '../lib/sky'

// Still line icons on a 24-unit grid, drawn in the text colour so they sit quietly
// beside it. The sky behind the page shows the weather itself.

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

const CLOUD = 'M7 18.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5Z'
// The same cloud, raised to leave room for what falls from it.
const CLOUD_HIGH = 'M7 14.5h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 5.6 4.5 4.5 0 0 0 7 14.5Z'
// A smaller cloud in front of the sun or moon.
const CLOUD_FRONT = 'M9 20h8.5a3.5 3.5 0 0 0 .5-6.96 4.75 4.75 0 0 0-9.1-.8A3.9 3.9 0 0 0 9 20Z'
const MOON = 'M15.5 3.5a8.5 8.5 0 1 0 5 15.2A7 7 0 0 1 15.5 3.5Z'

function Sun({ cx = 12, cy = 12, r = 4 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={r} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        const near = r + 2.5
        const far = r + 4.5
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * near}
            y1={cy + Math.sin(a) * near}
            x2={cx + Math.cos(a) * far}
            y2={cy + Math.sin(a) * far}
          />
        )
      })}
    </>
  )
}

function Falling({ kind }: { kind: 'drizzle' | 'rain' | 'snow' }) {
  if (kind === 'snow') {
    return (
      <>
        {[7.5, 12, 16.5].map((x, i) => (
          <circle key={x} cx={x} cy={i % 2 ? 20.5 : 18.5} r={0.9} fill="currentColor" />
        ))}
      </>
    )
  }
  const xs = kind === 'drizzle' ? [9, 15] : [8, 12, 16]
  return (
    <>
      {xs.map((x) => (
        <line key={x} x1={x} y1={17} x2={x - 1} y2={kind === 'drizzle' ? 19 : 21} />
      ))}
    </>
  )
}

function shapes(sky: Sky): ReactNode {
  switch (sky) {
    case 'clear-day':
      return <Sun />
    case 'clear-night':
      return <path d={MOON} />
    case 'partly-day':
      return (
        <>
          <Sun cx={9} cy={9} r={3} />
          <path d={CLOUD_FRONT} />
        </>
      )
    case 'partly-night':
      return (
        <>
          <path d="M10.5 2.5a6 6 0 1 0 4.2 10.3A5 5 0 0 1 10.5 2.5Z" />
          <path d={CLOUD_FRONT} />
        </>
      )
    case 'clouds-day':
    case 'clouds-night':
      return <path d={CLOUD} />
    case 'drizzle':
    case 'rain':
    case 'snow':
      return (
        <>
          <path d={CLOUD_HIGH} />
          <Falling kind={sky} />
        </>
      )
    case 'thunder':
      return (
        <>
          <path d={CLOUD_HIGH} />
          <path d="M12.5 15.5 10.5 19h3l-2 3.5" />
        </>
      )
    case 'mist':
      return (
        <>
          <line x1={4} y1={9} x2={20} y2={9} />
          <line x1={3} y1={13} x2={17} y2={13} />
          <line x1={6} y1={17} x2={21} y2={17} />
        </>
      )
  }
}

export function WeatherIcon({
  sky,
  size = 24,
  title,
}: {
  sky: Sky
  size?: number
  title?: string
}) {
  const label = title ?? LABELS[sky]
  return (
    <svg
      className="wx-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {shapes(sky)}
    </svg>
  )
}
