import { createSignal } from 'solid-js'

/**
 * The rail's three resting heights and how a drag settles between them. The
 * arithmetic is pure, so the gesture handling is testable without a DOM.
 *
 * The module also owns `railDetent`, which is UI state rather than geometry
 * and is neither pure nor DOM-free - it lives here because it has to survive
 * the rail's remount at the rail-or-deck threshold. Lifting it into the store
 * whose decision causes that remount (stores/workspaceLayoutStore.ts) is
 * still open, and would also let the detent's back entry survive the flip.
 *
 * Heights are CSS px measured from the bottom of the viewport; the peek
 * height includes the bottom safe area.
 */
export type Detent = 'peek' | 'medium' | 'large'

export const DETENTS: readonly Detent[] = ['peek', 'medium', 'large']
export const PEEK_HEIGHT = 96
export const MEDIUM_FRACTION = 0.44
export const LARGE_FRACTION = 0.88
/** px per ms; above this a release goes one detent in the direction of travel. */
export const FLICK_VELOCITY = 0.5
/**
 * How long a release may trail the last move and still count as a flick. A
 * finger that rested on the sheet before lifting placed it; the speed it
 * arrived at, however high, says nothing about where it should go.
 */
export const FLICK_MAX_AGE_MS = 100

/**
 * How long the sheet takes to reach a new detent. Mirrors --la-dur-sheet:
 * the panel inside must stay on screen until the height has arrived.
 */
export const SHEET_TRANSITION_MS = 280

/**
 * Where the rail rests, kept outside the component on purpose: crossing the
 * rail-or-deck threshold (a tablet rotating, an iPad resizing its Split View)
 * unmounts one surface and mounts the other, and a sheet the user had opened
 * must come back open rather than at the floor.
 */
export const [railDetent, setRailDetent] = createSignal<Detent>('peek')

export interface DetentHeights {
  readonly peek: number
  readonly medium: number
  readonly large: number
}

/**
 * The three resting heights for a viewport, in order and never below peek:
 * a keyboard can leave so little viewport that 44% of it would clip the
 * chips and the shutter. `maxHeight` is what the chrome above the sheet
 * leaves it (the top bar and the gap under it, the safe area below); the
 * sheet never rises into it.
 */
export function detentHeights(
  viewportHeight: number,
  maxHeight = Infinity,
): DetentHeights {
  const ceiling = Math.max(PEEK_HEIGHT, maxHeight)
  const medium = Math.min(
    ceiling,
    Math.max(PEEK_HEIGHT, Math.round(viewportHeight * MEDIUM_FRACTION)),
  )
  return {
    peek: PEEK_HEIGHT,
    medium,
    large: Math.min(
      ceiling,
      Math.max(medium, Math.round(viewportHeight * LARGE_FRACTION)),
    ),
  }
}

export function heightOf(detent: Detent, heights: DetentHeights): number {
  return heights[detent]
}

/** No rubber band past large, and never below peek: the rail is never gone. */
export function clampSheetHeight(
  height: number,
  heights: DetentHeights,
): number {
  return Math.min(heights.large, Math.max(heights.peek, height))
}

export function nearestDetent(height: number, heights: DetentHeights): Detent {
  let best: Detent = 'peek'
  let bestDistance = Infinity
  for (const detent of DETENTS) {
    const distance = Math.abs(heights[detent] - height)
    if (distance < bestDistance) {
      best = detent
      bestDistance = distance
    }
  }
  return best
}

/**
 * Where a released sheet comes to rest. A flick goes to the next detent in
 * the direction of travel (the smallest detent above the current height, or
 * the largest below it); anything slower settles at the nearest.
 */
export function settleDetent(
  height: number,
  velocity: number,
  heights: DetentHeights,
): Detent {
  if (velocity >= FLICK_VELOCITY) {
    return DETENTS.find((detent) => heights[detent] > height) ?? 'large'
  }
  if (velocity <= -FLICK_VELOCITY) {
    const below = DETENTS.filter((detent) => heights[detent] < height)
    return below.at(-1) ?? 'peek'
  }
  return nearestDetent(height, heights)
}
