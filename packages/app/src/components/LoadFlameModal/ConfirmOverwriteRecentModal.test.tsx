/**
 * The question at a full Recents, in the words of what the user did: a save
 * keeps the wording it always had, and leaving for a page of its own names
 * the flame that would be deleted and what each button does.
 */
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_RECENT_FLAMES } from '@/utils/recentFlames'
import { ConfirmOverwriteRecentModal } from './ConfirmOverwriteRecentModal'

afterEach(() => {
  cleanup()
})

describe('ConfirmOverwriteRecentModal', () => {
  it('asks a save the way it always has', () => {
    render(() => (
      <ConfirmOverwriteRecentModal oldestName="Spiral" respond={vi.fn()} />
    ))
    expect(screen.getByText('Save Limit Reached')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replace Oldest' })).toBeTruthy()
  })

  it.each([
    ['the explorer', 'explorer', 'The explorer opens in this tab'],
    ['the Benchmark Lab', 'benchmarks', 'The Benchmark Lab opens in this tab'],
  ] as const)(
    'names the flame that leaving for %s would delete',
    (_, occasion, opens) => {
      const respond = vi.fn()
      render(() => (
        <ConfirmOverwriteRecentModal
          oldestName="Spiral"
          occasion={occasion}
          respond={respond}
        />
      ))
      expect(screen.getByText('Recents is full')).toBeTruthy()
      const question = screen.getByText('Spiral').parentElement!
      expect(question.textContent).toContain(opens)
      expect(question.textContent).toContain(`${MAX_RECENT_FLAMES} flames`)
      expect(question.textContent).not.toMatch(/—/)

      fireEvent.click(
        screen.getByRole('button', { name: 'Stay in the editor' }),
      )
      expect(respond).toHaveBeenLastCalledWith(false)
      fireEvent.click(screen.getByRole('button', { name: 'Replace and open' }))
      expect(respond).toHaveBeenLastCalledWith(true)
    },
  )
})
