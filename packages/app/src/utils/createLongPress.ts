import { onCleanup } from 'solid-js'
import type { JSX } from 'solid-js'

export const LONG_PRESS_MS = 500

interface LongPressOptions {
  /** Fired at touch-down, before either outcome is known (the haptic goes here). */
  onPressStart?: () => void
  onTap: () => void
  onLongPress?: () => void
  ms?: number
}

type ButtonHandlers = Pick<
  JSX.HTMLAttributes<HTMLButtonElement>,
  | 'onPointerDown'
  | 'onPointerUp'
  | 'onPointerCancel'
  | 'onPointerLeave'
  | 'onLostPointerCapture'
  | 'onClick'
>

/**
 * One button, two actions: a tap does the common thing, holding it opens the
 * fuller version. The click that follows a long press is swallowed, so the
 * finger lifting does not also fire the tap, and so is a click that arrives
 * while the button is held. Shared by the rail's shutter and the tablet
 * deck's save button, which offer the same pair.
 *
 * The press belongs to the finger that started it. A second finger landing on
 * the same button is not a second press, and a lift from another pointer does
 * not end this one: otherwise the second touch-down orphaned the first timer,
 * which fired the long press with nothing on the screen.
 *
 * The pointer is captured so that the up comes back even once the long press
 * has opened a dialog over the button; where a browser will not capture it,
 * the latch still opens for a pointer going down again.
 */
export function createLongPress(options: LongPressOptions): ButtonHandlers {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pressedBy: number | null = null
  let longPressed = false

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pressedBy = null
  }
  onCleanup(cancel)

  const endPress = (event: PointerEvent) => {
    if (pressedBy !== null && event.pointerId !== pressedBy) return
    cancel()
  }

  return {
    onPointerDown: (event: PointerEvent) => {
      // A second finger on a press that is still running is not a second
      // press. A press whose long press has already fired is finished,
      // though, and a pointer cannot go down twice without lifting: either
      // means the up never came back (it landed on the dialog the long press
      // opened), and keeping the latch shut would leave the button dead.
      if (pressedBy !== null && !longPressed && event.pointerId !== pressedBy)
        return
      cancel()
      pressedBy = event.pointerId
      // Touch pointers are captured implicitly; a pen or a mouse is not, and
      // its up would land on whatever the long press opened.
      if (event.currentTarget instanceof HTMLElement) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Not every engine grants it. The latch above is the way out.
        }
      }
      options.onPressStart?.()
      longPressed = false
      if (!options.onLongPress) return
      timer = setTimeout(() => {
        timer = null
        longPressed = true
        options.onLongPress?.()
      }, options.ms ?? LONG_PRESS_MS)
    },
    onPointerUp: endPress,
    onPointerCancel: endPress,
    onPointerLeave: endPress,
    // The button left under the finger, so no up is coming.
    onLostPointerCapture: endPress,
    onClick: () => {
      if (longPressed) {
        longPressed = false
        return
      }
      // A click arriving while a finger still holds the button belongs to
      // some other pointer: this press has not ended, and taking it as a tap
      // runs both actions off one hold. A click with no press behind it is a
      // keyboard activation, which is a tap.
      if (pressedBy !== null) return
      options.onTap()
    },
  }
}
