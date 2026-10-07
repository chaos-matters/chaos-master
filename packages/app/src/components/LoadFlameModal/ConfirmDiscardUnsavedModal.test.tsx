/**
 * The question when storage refused the open flame: a replacement keeps the
 * wording it always had, and leaving for a page of its own says which page
 * opens and that it opens in this tab.
 */
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmDiscardUnsavedModal } from './ConfirmDiscardUnsavedModal'

afterEach(() => {
  cleanup()
})

describe('ConfirmDiscardUnsavedModal', () => {
  it('asks a replacement the way it always has', () => {
    const respond = vi.fn()
    render(() => <ConfirmDiscardUnsavedModal respond={respond} />)
    expect(
      screen.getByText(/Opening another one now would lose it/),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Anyway' }))
    expect(respond).toHaveBeenLastCalledWith(true)
  })

  it.each([
    ['explorer', 'The explorer opens in this tab'],
    ['benchmarks', 'The Benchmark Lab opens in this tab'],
  ] as const)('names the page that leaving for %s opens', (page, opens) => {
    const respond = vi.fn()
    render(() => <ConfirmDiscardUnsavedModal page={page} respond={respond} />)
    const question = screen.getByText(/refused to store/)
    expect(question.textContent).toContain(opens)
    expect(question.textContent).not.toMatch(/—/)

    fireEvent.click(screen.getByRole('button', { name: 'Keep This Flame' }))
    expect(respond).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Leave Anyway' }))
    expect(respond).toHaveBeenLastCalledWith(true)
  })
})
