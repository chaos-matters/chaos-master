/**
 * The explorer's undo stack: which changes become entries, which amend the
 * current one, and what undo and redo hand back.
 */
import { describe, expect, it } from 'vitest'
import { MANDELBROT_HOME } from './deepZoomView'
import { canRedoExplorer, canUndoExplorer, createExplorerHistory, EXPLORER_HISTORY_CAP, jumpExplorerHistory, redoExplorerHistory, sameExplorerPlace, settleExplorerHistory, undoExplorerHistory, } from './explorerHistory'
import { DEFAULT_LOCATION } from './explorerUrl'
import type { ExplorerLocation } from './explorerUrl'

/** The default location zoomed in by `zoomLog2` octaves. */
function at(zoomLog2: number): ExplorerLocation {
  return { ...DEFAULT_LOCATION, view: { ...MANDELBROT_HOME, zoomLog2 } }
}

const A = at(1)
const B = at(2)
const C = at(3)

describe('explorer history', () => {
  it('collapses a drag into one entry when it settles', () => {
    let h = createExplorerHistory(A)
    // Many moves, none of them settled: still one entry.
    let live = A
    for (let i = 1; i <= 50; i += 1) live = at(1 + i / 50)
    h = settleExplorerHistory(h, live)
    expect(h.past).toEqual([A])
    expect(h.present).toBe(live)
    expect(h.future).toEqual([])
  })

  it('settling where it already is records nothing', () => {
    const h = createExplorerHistory(A)
    expect(settleExplorerHistory(h, A)).toBe(h)
    // An equal location as a new object is the same place and colours.
    expect(settleExplorerHistory(h, { ...A })).toBe(h)
  })

  it('amends the entry for a colour-only change, keeping redo', () => {
    let h = createExplorerHistory(A)
    h = settleExplorerHistory(h, B)
    h = undoExplorerHistory(h, B)!
    expect(h.present).toBe(A)
    const recoloured = { ...A, colourShift: 0.4, relief: 0.9, paletteId: 'x' }
    h = settleExplorerHistory(h, recoloured)
    expect(h.present).toBe(recoloured)
    expect(h.past).toEqual([])
    expect(h.future).toEqual([B])
    // Redo goes to the entry as it was left, colours and all.
    h = redoExplorerHistory(h, recoloured)!
    expect(h.present).toBe(B)
    // And back again finds the recoloured entry.
    h = undoExplorerHistory(h, B)!
    expect(h.present).toBe(recoloured)
  })

  it('undo brings back the colours of the entry before', () => {
    let h = createExplorerHistory({ ...A, colourCycle: 128 })
    h = jumpExplorerHistory(h, h.present, { ...B, colourCycle: 512 })
    h = undoExplorerHistory(h, h.present)!
    expect(h.present.colourCycle).toBe(128)
  })

  it('a new move clears redo', () => {
    let h = createExplorerHistory(A)
    h = settleExplorerHistory(h, B)
    h = undoExplorerHistory(h, B)!
    expect(canRedoExplorer(h, A)).toBe(true)
    h = settleExplorerHistory(h, C)
    expect(h.future).toEqual([])
    expect(canRedoExplorer(h, C)).toBe(false)
  })

  it(`keeps at most ${EXPLORER_HISTORY_CAP} entries to go back to`, () => {
    let h = createExplorerHistory(at(0))
    for (let i = 1; i <= EXPLORER_HISTORY_CAP + 20; i += 1) {
      h = settleExplorerHistory(h, at(i))
    }
    expect(h.past).toHaveLength(EXPLORER_HISTORY_CAP)
    // The oldest went first.
    expect(h.past[0]).toEqual(at(20))
    expect(h.present).toEqual(at(EXPLORER_HISTORY_CAP + 20))
  })

  it('takes a cap of its own', () => {
    let h = createExplorerHistory(at(0))
    for (let i = 1; i <= 5; i += 1) h = settleExplorerHistory(h, at(i), 2)
    expect(h.past).toEqual([at(3), at(4)])
  })

  it('undo after a jump returns to the exact place before it', () => {
    const before: ExplorerLocation = {
      ...DEFAULT_LOCATION,
      view: {
        centerRe: '-0.743643887037158704752191506114774',
        centerIm: '0.131825904205311970493132056385139',
        zoomLog2: 98.5,
      },
      colourShift: 0.3,
    }
    let h = createExplorerHistory(A)
    h = settleExplorerHistory(h, before)
    const dropped = { ...C, kind: 'julia' as const }
    h = jumpExplorerHistory(h, before, dropped)
    expect(h.present).toBe(dropped)
    h = undoExplorerHistory(h, dropped)!
    expect(h.present).toBe(before)
  })

  it('a jump that changes only the colours is still a step of its own', () => {
    // A dropped picture of the same place in other colours.
    const recoloured = { ...A, colourCycle: 512, relief: 0.9 }
    let h = createExplorerHistory(A)
    h = jumpExplorerHistory(h, A, recoloured)
    expect(h.past).toEqual([A])
    expect(h.present).toBe(recoloured)
    expect(undoExplorerHistory(h, recoloured)?.present).toBe(A)
    // A jump to exactly where the view is records nothing.
    expect(jumpExplorerHistory(h, recoloured, { ...recoloured })).toBe(h)
  })

  it('a jump settles a move still pending, so both can be undone', () => {
    let h = createExplorerHistory(A)
    // B was dragged to but has not settled when C is jumped to.
    h = jumpExplorerHistory(h, B, C)
    expect(h.past).toEqual([A, B])
    expect(h.present).toBe(C)
  })

  it('undo during an unsettled move goes back to where the move began', () => {
    const h = createExplorerHistory(A)
    expect(canUndoExplorer(h, B)).toBe(true)
    const undone = undoExplorerHistory(h, B)!
    expect(undone.present).toBe(A)
    expect(undone.future).toEqual([B])
  })

  it('undo and redo record no entry of their own', () => {
    let h = createExplorerHistory(A)
    h = settleExplorerHistory(h, B)
    h = settleExplorerHistory(h, C)
    h = undoExplorerHistory(h, C)!
    // What undo applied then settles: no new entry, redo still there.
    const settled = settleExplorerHistory(h, h.present)
    expect(settled).toBe(h)
    expect(settled.past).toEqual([A])
    expect(settled.future).toEqual([C])
    h = redoExplorerHistory(settled, settled.present)!
    expect(settleExplorerHistory(h, h.present)).toBe(h)
    expect(h.past).toEqual([A, B])
    expect(h.future).toEqual([])
  })

  it('has nothing to undo or redo at the start', () => {
    const h = createExplorerHistory(A)
    expect(canUndoExplorer(h, A)).toBe(false)
    expect(canRedoExplorer(h, A)).toBe(false)
    expect(undoExplorerHistory(h, A)).toBeUndefined()
    expect(redoExplorerHistory(h, A)).toBeUndefined()
  })

  it('offers no redo while a move is pending, since settling it clears redo', () => {
    let h = createExplorerHistory(A)
    h = settleExplorerHistory(h, B)
    h = undoExplorerHistory(h, B)!
    expect(canRedoExplorer(h, C)).toBe(false)
    expect(redoExplorerHistory(h, C)).toBeUndefined()
    // A colour change pending is not a move: redo stays.
    expect(canRedoExplorer(h, { ...A, relief: 0.1 })).toBe(true)
  })

  it('counts the place, not the colours, as what makes an entry', () => {
    expect(sameExplorerPlace(A, { ...A, colourCycle: 9, paletteId: 'p' })).toBe(
      true,
    )
    expect(sameExplorerPlace(A, B)).toBe(false)
    expect(sameExplorerPlace(A, { ...A, maxIterations: 2000 })).toBe(false)
    expect(sameExplorerPlace(A, { ...A, split: true })).toBe(false)
  })
})
