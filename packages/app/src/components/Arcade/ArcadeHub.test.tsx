import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArcadeHub } from './ArcadeHub'

describe('the Arcade hub', () => {
  afterEach(cleanup)

  it('offers a way out that does not need scrolling', () => {
    // The footer button sits below the whole card grid. Escape covers a
    // keyboard, and a tablet has none - so the hub carries a back control of
    // its own, pinned where it cannot leave with the scroll.
    const onBackToEditor = vi.fn()
    render(() => <ArcadeHub onBackToEditor={onBackToEditor} />)

    const back = screen.getByTestId('arcade-back')
    expect(back.getAttribute('aria-label')).toBe('Back to editor')

    fireEvent.click(back)
    expect(onBackToEditor).toHaveBeenCalledTimes(1)
  })

  it('keeps the footer button, the natural end-of-page action', () => {
    // Removing it would be a regression for anyone who has scrolled to read
    // the cards and wants out from where they are.
    const onBackToEditor = vi.fn()
    render(() => <ArcadeHub onBackToEditor={onBackToEditor} />)

    // By its text, not its role and name: the pinned control above answers to
    // the same name through its aria-label.
    fireEvent.click(screen.getByText('Back to editor'))
    expect(onBackToEditor).toHaveBeenCalledTimes(1)
  })
})
