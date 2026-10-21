import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { OverviewItem } from '../api/client'
import { sessionQuery } from '../api/queries'
import { skyFor } from '../lib/sky'
import { usePreferences } from '../preferences-context'
import { WeatherIcon } from './WeatherIcon'

type Option = { kind: 'location'; item: OverviewItem } | { kind: 'add'; query: string }

function matches(item: OverviewItem, query: string): boolean {
  const haystack = `${item.location.display_name} ${item.location.country}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word))
}

function LocationSearch({ items }: { items: OverviewItem[] }) {
  const navigate = useNavigate()
  const { data: session } = useQuery(sessionQuery())
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const options = useMemo<Option[]>(() => {
    const trimmed = query.trim()
    if (!trimmed) return items.map((item) => ({ kind: 'location', item }))
    const found: Option[] = items
      .filter((item) => matches(item, trimmed))
      .map((item) => ({ kind: 'location', item }))
    if (session?.is_admin && session.can_collect) found.push({ kind: 'add', query: trimmed })
    return found
  }, [items, query, session])

  const choose = (option: Option | undefined) => {
    if (!option) return
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
    if (option.kind === 'location') {
      void navigate({
        to: '/locations/$locationId',
        params: { locationId: option.item.location.id },
      })
    } else {
      void navigate({ to: '/manage', search: { q: option.query } })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, options.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(options[highlight])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const activeId = open && options[highlight] ? `${listId}-${highlight}` : undefined

  return (
    <div className="search">
      <label htmlFor={`${listId}-input`} className="visually-hidden">
        Search locations
      </label>
      <input
        ref={inputRef}
        id={`${listId}-input`}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder="Search locations"
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setHighlight(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on an option registers before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul className="search-results" id={listId} role="listbox" aria-label="Locations">
          {options.length === 0 ? (
            <li className="search-empty" role="presentation">
              No tracked location matches “{query.trim()}”.
            </li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.kind === 'location' ? option.item.location.id : 'add'}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? 'is-highlighted' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onMouseEnter={() => setHighlight(index)}
              >
                {option.kind === 'location' ? (
                  option.item.location.display_name
                ) : (
                  <>Add “{option.query}” as a new location…</>
                )}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}

/** One-click access to every tracked location, plus search. */
export function LocationSwitcher({
  items,
  activeId,
}: {
  items: OverviewItem[]
  activeId?: number
}) {
  const { units } = usePreferences()
  if (items.length === 0) return null
  return (
    <nav className="switcher" aria-label="Locations">
      <LocationSearch items={items} />
      <ul className="pills">
        {items.map(({ location, current }) => (
          <li key={location.id}>
            <Link
              to="/locations/$locationId"
              params={{ locationId: location.id }}
              className="pill"
              aria-current={location.id === activeId ? 'page' : undefined}
            >
              {current ? <WeatherIcon sky={skyFor(current)} size={22} /> : null}
              <span>{location.name}</span>
              {current ? (
                <span className="pill-temp">{Math.round(units.temp(current.temp))}°</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
