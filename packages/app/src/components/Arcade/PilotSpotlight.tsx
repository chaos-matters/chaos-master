import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { pilotFocus } from '@/arcade/pilotFocus'
import { resolveFocusElement, revealFocusElement } from '@/recorder/focus'
import { deriveReplayFocusPreparation } from '@/recorder/focusPreparation'
import ui from './PilotSpotlight.module.css'
import type { PilotFocusStep } from '@/arcade/pilotFocus'
import type { ReplayFocusPreparationHandler } from '@/recorder/focusPreparation'

/**
 * How long a ring stays put before a newer step may move it.
 *
 * An agent issues its edits as fast as the tool loop allows — six inside 26ms
 * in a real lesson — and a ring chasing every one of those is a strobe, not a
 * pointer. Newer targets are held and applied when the dwell expires, so a
 * burst reads as a few deliberate moves and always ends on the last one.
 */
const MIN_DWELL_MS = 700

/** Long enough for a panel to open and lay out before the ring is measured. */
const SETTLE_MS = 120

/** Nothing has moved for this long, so stop re-measuring until the next step. */
const TRACK_MS = 1600

type Rect = { x: number; y: number; width: number; height: number }

function rectOf(element: Element): Rect | undefined {
  const box = element.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) return undefined
  return { x: box.left, y: box.top, width: box.width, height: box.height }
}

function same(a: Rect | undefined, b: Rect | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}

/**
 * A ring around the control the agent just used, over the pilot lock.
 *
 * Deliberately NOT the replay follow-cam. That one dims everything it is not
 * pointing at, which is exactly wrong here: the lock was just made almost
 * transparent so the lesson stays watchable, and a scrim would undo that. It
 * also sits below the lock in the stacking order and would have to be raised
 * above it, where it would dim the overlay's own banner and rail.
 *
 * So: no scrim, no mask, no dimming. A ring and a label, above the lock.
 */
export function PilotSpotlight(props: {
  onPrepareFocus?: ReplayFocusPreparationHandler
}) {
  const [rect, setRect] = createSignal<Rect>()
  const [label, setLabel] = createSignal<string>()

  // The step whose ring is currently shown, and the one waiting for the dwell
  // to expire. Plain variables: neither is rendered, and making them signals
  // would re-run the effect that writes them.
  let shownSeq = 0
  let pending: PilotFocusStep | undefined
  let dwellTimer: number | undefined
  let settleTimer: number | undefined
  let frame: number | undefined
  let trackUntil = 0

  const stopTracking = () => {
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
  }

  const measure = (hint: string) => {
    // A control that is not there YET is the normal case, not a dead end: a
    // card that has to expand first mounts its contents a frame or two after
    // the preparation asks it to. Keep looking for the whole tracking window
    // rather than giving up on the first miss and showing no ring at all.
    const element = resolveFocusElement(hint)
    const next = element === null ? undefined : rectOf(element)
    setRect((previous) => (same(previous, next) ? previous : next))
    if (globalThis.performance.now() < trackUntil) {
      frame = requestAnimationFrame(() => {
        measure(hint)
      })
    } else {
      frame = undefined
    }
  }

  const show = (target: PilotFocusStep) => {
    shownSeq = target.seq
    window.clearTimeout(settleTimer)
    stopTracking()

    // Replay's own derivation, on the action the recorder just wrote: it both
    // says which panels have to be open and upgrades the hint (a deleted
    // transform points at the list, not at the row that no longer exists).
    const preparation = deriveReplayFocusPreparation(target.action)
    const hint = preparation.spotlightFocus

    if (hint === undefined) {
      // A step the focus vocabulary cannot place. Say nothing, rather than
      // leave the ring on the last control and imply the agent touched it again.
      setRect(undefined)
      setLabel(undefined)
    } else {
      // Open whatever has to be open before the control exists to be measured.
      props.onPrepareFocus?.(preparation)
      settleTimer = window.setTimeout(() => {
        const element = resolveFocusElement(hint)
        if (element !== null) revealFocusElement(element)
        trackUntil = globalThis.performance.now() + TRACK_MS
        // The label changes with the box, not before it: relabelling first
        // left the previous step's ring wearing the next step's caption for
        // as long as the panel took to settle.
        setLabel(target.label)
        measure(hint)
      }, SETTLE_MS)
    }

    window.clearTimeout(dwellTimer)
    dwellTimer = window.setTimeout(() => {
      dwellTimer = undefined
      const queued = pending
      pending = undefined
      if (queued) show(queued)
    }, MIN_DWELL_MS)
  }

  createEffect(() => {
    const focus = pilotFocus()
    if (!focus) {
      pending = undefined
      setRect(undefined)
      setLabel(undefined)
      return
    }
    if (focus.seq === shownSeq) return
    if (dwellTimer !== undefined) {
      // Mid-dwell: remember the newest and let the timer bring it up. Only the
      // newest, so a burst of ten steps costs one extra ring, not ten — and
      // the burst still ends on the step the agent actually finished on.
      pending = focus
      return
    }
    show(focus)
  })

  onCleanup(() => {
    window.clearTimeout(dwellTimer)
    window.clearTimeout(settleTimer)
    stopTracking()
  })

  return (
    <Show when={rect()}>
      {(box) => (
        <div
          class={ui.ring}
          data-testid="pilot-spotlight"
          aria-hidden="true"
          style={{
            left: `${box().x}px`,
            top: `${box().y}px`,
            width: `${box().width}px`,
            height: `${box().height}px`,
          }}
        >
          <Show when={label()}>
            {(text) => <span class={ui.label}>{text()}</span>}
          </Show>
        </div>
      )}
    </Show>
  )
}
