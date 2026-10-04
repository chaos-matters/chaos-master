/**
 * The deep-zoom explorer's undo stack, as pure functions over whole
 * locations. Every entry is a complete `ExplorerLocation`, colours included,
 * so undoing a jump brings back the place and the look it left.
 *
 * What makes an entry is a change of place: the view, the fractal, the
 * Julia constant, the iteration limit, the split. A change of colours alone
 * (cycle, shift, relief, palette) amends the current entry instead, so a
 * slider swipe never fills the stack and never clears redo. A discrete jump
 * is an entry even when only its colours differ: undoing a dropped picture
 * of the same place brings back the look it replaced.
 *
 * The page calls `settleExplorerHistory` when a continuous move comes to
 * rest and `jumpExplorerHistory` for a discrete jump. Undo and redo take the
 * live location too: a move that has not settled yet is settled first, so
 * undo always returns to where that move began.
 */
import { formatExplorerHash } from './explorerUrl'
import type { ExplorerLocation } from './explorerUrl'

export interface ExplorerHistory {
  /** Entries to go back to, oldest first. */
  readonly past: readonly ExplorerLocation[]
  /** The entry the view is on, or last settled on. */
  readonly present: ExplorerLocation
  /** Entries undone, nearest first. */
  readonly future: readonly ExplorerLocation[]
}

/** About an hour of exploring, and a few megabytes of digits at most. */
export const EXPLORER_HISTORY_CAP = 100

const PLACE_ONLY = {
  paletteId: undefined,
  colourCycle: 0,
  colourShift: 0,
  relief: 0,
} as const

/**
 * Do two locations show the same place, whatever their colours? Compared
 * through the link format, which holds exactly what the explorer shows: a
 * Julia constant the Mandelbrot set does not use is not part of its place.
 */
export function sameExplorerPlace(
  a: ExplorerLocation,
  b: ExplorerLocation,
): boolean {
  if (a === b) return true
  return (
    formatExplorerHash({ ...a, ...PLACE_ONLY }) ===
    formatExplorerHash({ ...b, ...PLACE_ONLY })
  )
}

function sameColours(a: ExplorerLocation, b: ExplorerLocation): boolean {
  return (
    a.paletteId === b.paletteId &&
    a.colourCycle === b.colourCycle &&
    a.colourShift === b.colourShift &&
    a.relief === b.relief
  )
}

export function createExplorerHistory(
  location: ExplorerLocation,
): ExplorerHistory {
  return { past: [], present: location, future: [] }
}

/**
 * The live location has come to rest. A new place becomes an entry and
 * clears redo; new colours on the same place amend the current entry; no
 * change at all returns the history unchanged.
 */
export function settleExplorerHistory(
  history: ExplorerHistory,
  live: ExplorerLocation,
  cap: number = EXPLORER_HISTORY_CAP,
): ExplorerHistory {
  const { present } = history
  if (live === present) return history
  if (sameExplorerPlace(live, present)) {
    return sameColours(live, present) ? history : { ...history, present: live }
  }
  return withEntry(history, live, cap)
}

/** `next` as a new entry: the present goes back one, and redo is cleared. */
function withEntry(
  history: ExplorerHistory,
  next: ExplorerLocation,
  cap: number,
): ExplorerHistory {
  const past = [...history.past, history.present]
  return {
    past: past.length > cap ? past.slice(past.length - cap) : past,
    present: next,
    future: [],
  }
}

/**
 * A discrete jump to `next`: a drop, a followed link, Home, a mode switch.
 * A move still pending in `live` is settled first, so it stays a step of
 * its own. The jump is an entry whenever anything differs, colours alone
 * included; only a jump to exactly where the view is records nothing.
 */
export function jumpExplorerHistory(
  history: ExplorerHistory,
  live: ExplorerLocation,
  next: ExplorerLocation,
  cap: number = EXPLORER_HISTORY_CAP,
): ExplorerHistory {
  const settled = settleExplorerHistory(history, live, cap)
  const { present } = settled
  if (
    next === present ||
    (sameExplorerPlace(next, present) && sameColours(next, present))
  ) {
    return settled
  }
  return withEntry(settled, next, cap)
}

/** Is there an entry to go back to, counting a move not yet settled? */
export function canUndoExplorer(
  history: ExplorerHistory,
  live: ExplorerLocation,
): boolean {
  return history.past.length > 0 || !sameExplorerPlace(live, history.present)
}

/**
 * Is there an entry to go forward to? Not while a move is pending: settling
 * it is a new step, and a new step clears redo.
 */
export function canRedoExplorer(
  history: ExplorerHistory,
  live: ExplorerLocation,
): boolean {
  return history.future.length > 0 && sameExplorerPlace(live, history.present)
}

/**
 * One entry back, or undefined when there is none. Its `present` is the
 * location to show; showing it and settling records nothing.
 */
export function undoExplorerHistory(
  history: ExplorerHistory,
  live: ExplorerLocation,
): ExplorerHistory | undefined {
  const settled = settleExplorerHistory(history, live)
  const previous = settled.past.at(-1)
  if (previous === undefined) return undefined
  return {
    past: settled.past.slice(0, -1),
    present: previous,
    future: [settled.present, ...settled.future],
  }
}

/** One entry forward, or undefined when there is none. */
export function redoExplorerHistory(
  history: ExplorerHistory,
  live: ExplorerLocation,
): ExplorerHistory | undefined {
  if (!canRedoExplorer(history, live)) return undefined
  const settled = settleExplorerHistory(history, live)
  const [next, ...future] = settled.future
  if (next === undefined) return undefined
  return {
    past: [...settled.past, settled.present],
    present: next,
    future,
  }
}
