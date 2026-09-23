/**
 * Enter on the select-then-apply grid (the breed gallery, the randomizer's
 * own modal), with a candidate selected.
 *
 * It applies the selection only from the grid: the cell a click selected and
 * focused, or the grid itself. It used to listen on the whole document, so
 * the Enter a focused control needed, a toolbar button or a cell's own
 * Mutate, applied the selected candidate instead of pressing that control.
 * Under the Arcade's screen lock it applies nothing: the agent owns the
 * keyboard, and the Enter a focused Stop button needs stays its own.
 */
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetPilot, startPilot } from '@/arcade/pilot'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { GalleryGrid } from './GalleryGrid'

// The cells' thumbnails render through WebGPU; the key handling does not.
vi.mock('@/components/VariationSelector/VariationSelector', () => ({
  VariationPreview: () => null,
}))

function drive(lock: 'screen' | 'seat') {
  startPilot({
    mode: lock === 'screen' ? 'teach' : 'duel',
    title: 'Driving',
    stepBudget: 10,
    allowed: ['flame.'],
    qualityRankAtStart: 1,
    seatId: lock === 'screen' ? 'player' : 'rival',
    lock,
  })
}

function mountWithSelection() {
  const onApply = vi.fn()
  const onMutate = vi.fn()
  render(() => (
    <>
      <button type="button">Re-roll</button>
      <GalleryGrid
        candidates={[
          deepClone(examples.example1),
          deepClone(examples.example2),
        ]}
        version={0}
        onApply={onApply}
        onMutate={onMutate}
      />
    </>
  ))
  const cell = screen.getAllByTitle('Click to select')[0]!
  fireEvent.click(cell)
  // A browser focuses the cell on that click; happy-dom does not.
  cell.focus()
  expect(onApply).not.toHaveBeenCalled()
  return { onApply, onMutate, cell }
}

function pressEnter(target: Element): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(ev)
  return ev
}

afterEach(() => {
  cleanup()
  resetPilot()
})

describe('Enter on a gallery with a selected candidate', () => {
  it('applies the candidate from the cell a click selected', () => {
    const { onApply, cell } = mountWithSelection()

    const ev = pressEnter(cell)

    expect(onApply).toHaveBeenCalledTimes(1)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('leaves the Enter of a focused control outside the grid to it', () => {
    const { onApply } = mountWithSelection()

    const ev = pressEnter(screen.getByRole('button', { name: 'Re-roll' }))

    expect(onApply).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it("leaves a cell's own buttons their Enter", () => {
    const { onApply } = mountWithSelection()

    const ev = pressEnter(
      screen.getAllByTitle('Mutate: breed variations of this flame')[0]!,
    )

    expect(onApply).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('applies nothing and claims nothing while the agent owns the screen', () => {
    const { onApply, cell } = mountWithSelection()
    drive('screen')

    const ev = pressEnter(cell)

    expect(onApply).not.toHaveBeenCalled()
    expect(ev.defaultPrevented).toBe(false)
  })

  it('applies the candidate under a seat lock', () => {
    const { onApply, cell } = mountWithSelection()
    drive('seat')

    pressEnter(cell)

    expect(onApply).toHaveBeenCalledTimes(1)
  })
})
