export function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {detail ? <div className="tile-detail">{detail}</div> : null}
    </div>
  )
}
