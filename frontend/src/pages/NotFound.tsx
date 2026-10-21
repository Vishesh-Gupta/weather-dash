import { Link } from '@tanstack/react-router'

export function NotFoundPage() {
  return (
    <div className="stack">
      <h1>Not found</h1>
      <p className="subtle on-sky">That page or location doesn’t exist, or is no longer tracked.</p>
      <p>
        <Link to="/" className="button">
          Back to the dashboard
        </Link>
      </p>
    </div>
  )
}
