/**
 * Home — what one pointer sequence on a plate MEANT.
 *
 * Plates carry a camera now (drag to pan, wheel to zoom — see HomeFlame.tsx), so
 * "the pointer went down and came up on this plate" is no longer the same
 * question as "open this flame". Three outcomes, and only one of them is
 * destructive:
 *
 *  - a SELECT hands the plate the camera and reveals what else it can do;
 *  - an OPEN throws the user into the workspace and replaces what is there;
 *  - a DRAG is the camera being used and must resolve to neither.
 *
 * Keeping the rule here — as a state machine over plain `{clientX, clientY}`
 * points and an injected clock — is what makes it testable without a DOM, and
 * what keeps the component free of the timing constants.
 *
 * The one thing this deliberately does NOT do is listen for the browser's own
 * `dblclick`: it fires after a `click`, so acting on both means every open is
 * preceded by a select — the plate takes the camera, the hint appears, and THEN
 * the workspace opens. Recognising the pair here lets the first tap of a double
 * be withheld until it is known not to be one.
 */

/**
 * A pointer sequence that travelled further than this is a drag, and a drag
 * never selects and never opens. Small enough that a deliberate click survives
 * a shaky hand; large enough that a trackpad's one-pixel jitter is not a drag.
 */
export const DRAG_THRESHOLD_PX = 5

/**
 * Held down longer than this — even without moving — is a press, not a click.
 * A slow, still press on a plate is someone deciding, or a touch user waiting
 * for a context menu; opening the editor under them would be a surprise.
 */
export const HOLD_MS = 500

/** Two clean taps closer together in time than this are one double-click. */
export const DOUBLE_CLICK_MS = 400

/**
 * ...and closer together in space than this. Browsers apply a slop radius to
 * `dblclick` for the same reason: two taps at opposite ends of a wide plate are
 * two separate decisions, not one gesture.
 */
export const DOUBLE_CLICK_SLOP_PX = 24

/** What a completed pointer sequence turned out to mean. */
export type PlateGesture =
  /** A drag, a press, or a sequence that never started here. Do nothing. */
  | 'none'
  /** Take the camera and show what this plate can do. */
  | 'select'
  /** Open this flame in the workspace. */
  | 'open'

/** Just enough of a PointerEvent to decide, so tests need no DOM. */
export interface GesturePoint {
  clientX: number
  clientY: number
}

export function pointerDistance(a: GesturePoint, b: GesturePoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

export interface PlateGestureRecogniser {
  /** The pointer went down on the plate. */
  down: (point: GesturePoint, now: number) => void
  /** The pointer moved while down. Safe to call when nothing is in progress. */
  move: (point: GesturePoint, now: number) => void
  /** The pointer came up. Returns what the whole sequence meant. */
  up: (point: GesturePoint, now: number) => PlateGesture
  /**
   * The sequence was taken away (`pointercancel`, the plate unmounting, the
   * pointer leaving for another plate). Ends the sequence AND breaks the
   * double-click chain: a half-finished gesture must not combine with the next
   * tap into an open.
   */
  cancel: () => void
}

export interface PlateGestureOptions {
  dragThresholdPx?: number
  holdMs?: number
  doubleClickMs?: number
  doubleClickSlopPx?: number
}

/**
 * One plate's recogniser. Stateful but not reactive: the component feeds it
 * pointer events and acts on what `up` returns.
 */
export function createPlateGestureRecogniser(
  options: PlateGestureOptions = {},
): PlateGestureRecogniser {
  const dragThresholdPx = options.dragThresholdPx ?? DRAG_THRESHOLD_PX
  const holdMs = options.holdMs ?? HOLD_MS
  const doubleClickMs = options.doubleClickMs ?? DOUBLE_CLICK_MS
  const doubleClickSlopPx = options.doubleClickSlopPx ?? DOUBLE_CLICK_SLOP_PX

  /** Where and when the pointer went down, or undefined between sequences. */
  let start: { point: GesturePoint; at: number } | undefined
  /**
   * Latched the moment the sequence passes the threshold, and never cleared
   * until the next `down`. Coming back to within 5px of the start does not
   * un-drag a drag — the camera has already moved, so releasing there must not
   * read as a click on the picture the user just changed.
   */
  let dragged = false
  /** The last tap that could still become the first half of a double-click. */
  let pendingTap: { point: GesturePoint; at: number } | undefined

  function endSequence() {
    start = undefined
    dragged = false
  }

  return {
    down(point, now) {
      start = {
        point: { clientX: point.clientX, clientY: point.clientY },
        at: now,
      }
      dragged = false
    },
    move(point, now) {
      void now
      if (start === undefined || dragged) {
        return
      }
      if (pointerDistance(start.point, point) > dragThresholdPx) {
        dragged = true
      }
    },
    up(point, now) {
      const began = start
      const wasDrag = dragged
      endSequence()
      if (began === undefined) {
        // The press started somewhere else (a rail button, another plate) and
        // merely finished here. Not this plate's gesture.
        return 'none'
      }
      if (wasDrag || pointerDistance(began.point, point) > dragThresholdPx) {
        // The camera was driven. Also breaks the chain, so "tap, drag, tap"
        // cannot smuggle an open past the drag in the middle.
        pendingTap = undefined
        return 'none'
      }
      if (now - began.at > holdMs) {
        pendingTap = undefined
        return 'none'
      }
      const previous = pendingTap
      if (
        previous !== undefined &&
        now - previous.at <= doubleClickMs &&
        pointerDistance(previous.point, point) <= doubleClickSlopPx
      ) {
        // Consumed: a third tap starts a fresh chain rather than opening again.
        pendingTap = undefined
        return 'open'
      }
      pendingTap = {
        point: { clientX: point.clientX, clientY: point.clientY },
        at: now,
      }
      return 'select'
    },
    cancel() {
      endSequence()
      pendingTap = undefined
    },
  }
}

/**
 * Keyboard has no drag to disambiguate, so it opens outright — the plate is a
 * button and Enter/Space are what a button does. Space is matched by both of
 * its historical key names because older engines still report `Spacebar`.
 */
export function opensFromKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}
