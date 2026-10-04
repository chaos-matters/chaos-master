/**
 * Click-and-drag scrubbing for a text input that keeps its look, as the
 * editor's ScrubInput does for its labels. A sideways drag on an input that
 * is not being edited reports how far it went; a press that does not move
 * focuses the input and selects its text, for typing. Shift makes the drag
 * ten times finer.
 *
 * A drag only scrubs once it has gone further sideways than up or down.
 * Give the input `touch-action: pan-y` too: a finger that moves mostly up
 * or down then scrolls the panel around it, and the few pixels of drift
 * before the browser takes the gesture over change nothing.
 */
import { createDragHandler } from './createDragHandler'

const { abs } = Math

/** CSS px a press may wander and still count as a click. */
const DEAD_ZONE = 4
/** A fingertip wanders further on a tap: platforms allow 8 to 10 px. */
const TOUCH_DEAD_ZONE = 10
/** Shift's share of a plain drag. */
const FINE = 0.1

export interface InputScrub {
  /** A drag began: read the value it starts from. */
  onStart: () => void
  /** CSS px dragged right since the last call, left negative, Shift applied. */
  onScrub: (dx: number) => void
}

export function createInputScrub(
  scrub: InputScrub,
): (event: PointerEvent) => void {
  return createDragHandler(
    (down) => {
      const input = down.currentTarget
      if (!(input instanceof HTMLInputElement)) return undefined
      // Being edited: a press places the caret, as in any text field.
      if (document.activeElement === input) return undefined
      // A mouse or pen press would focus the field and start selecting text
      // under the drag. A finger's tap focuses it natively, keyboard and all.
      if (down.pointerType !== 'touch') down.preventDefault()
      const deadZone =
        down.pointerType === 'touch' ? TOUCH_DEAD_ZONE : DEAD_ZONE
      let lastX = down.clientX
      let dragging = false
      return {
        onPointerMove(move) {
          if (!dragging) {
            const dx = move.clientX - down.clientX
            const dy = move.clientY - down.clientY
            if (abs(dx) < deadZone || abs(dx) <= abs(dy)) return
            dragging = true
            scrub.onStart()
          }
          const dx = move.clientX - lastX
          lastX = move.clientX
          if (dx !== 0) scrub.onScrub(move.shiftKey ? dx * FINE : dx)
        },
        onDone(up) {
          // A press that did not move is a click: edit the value as text.
          // A cancelled one is the browser scrolling the panel instead, and
          // focusing would pop up a phone's keyboard mid-scroll.
          if (dragging || up?.type !== 'pointerup') return
          input.focus()
          input.select()
        },
      }
    },
    { preventDefault: false },
  )
}
