import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LiveValue, Meter, Sparkline } from './Instrument'

describe('LiveValue', () => {
  it('highlights a value only when a live update changes it', () => {
    const { rerender } = render(<LiveValue value="17°" />)
    expect(screen.getByText('17°')).not.toHaveClass('live-changed')
    rerender(<LiveValue value="17°" />)
    expect(screen.getByText('17°')).not.toHaveClass('live-changed')
    rerender(<LiveValue value="18°" />)
    expect(screen.getByText('18°')).toHaveClass('live-changed')
  })
})

describe('Sparkline', () => {
  it('draws a line and marks the latest point', () => {
    const { container } = render(<Sparkline values={[1012, 1013, null, 1011]} />)
    expect(container.querySelector('.sparkline-line')?.getAttribute('d')).toMatch(/^M0\.00 /)
    expect(container.querySelector<HTMLElement>('.sparkline-end')?.style.left).toBe('100%')
  })

  it('needs at least two readings', () => {
    const { container } = render(<Sparkline values={[1012]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('Meter', () => {
  it('reports its value to assistive technology', () => {
    render(<Meter value={0.42} label="Chance of precipitation" />)
    expect(screen.getByRole('meter', { name: 'Chance of precipitation' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    )
  })
})
