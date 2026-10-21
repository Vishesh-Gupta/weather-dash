import { moonLitPath, moonPhaseName } from '../lib/astro'

/** The moon as it looks tonight: a dim disc with its lit portion. */
export function Moon({ phase, size }: { phase: number; size: number }) {
  const r = size / 2 - 1
  const c = size / 2
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={moonPhaseName(phase)}
    >
      <title>{moonPhaseName(phase)}</title>
      <circle cx={c} cy={c} r={r} fill="rgba(255, 255, 255, 0.14)" />
      <path d={moonLitPath(phase, c, c, r)} fill="#f4f1e1" />
    </svg>
  )
}
