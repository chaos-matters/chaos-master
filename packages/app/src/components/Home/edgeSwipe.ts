import { popBack } from '@/lib/backStack'
import { createDragHandler } from '@/utils/createDragHandler'

/**
 * Home — the interactive edge swipe.
 *
 * iOS has no back gesture of its own (A/screens.md 0.5), and Home is the one
 * full-screen layer with somewhere to go back to. A drag that begins against
 * the leading edge and travels far enough to the right pops the back registry
 * once, which is the same thing the Android gesture does: it dismisses the
 * topmost layer rather than Home specifically. A modal is not one of those
 * layers in practice - `showModal()` puts the dialog in the top layer and
 * makes the rest of the document inert, so no pointer event reaches Home
 * while one is up.
 */

/** How close to the leading edge a swipe has to start to be this gesture. */
export const EDGE_SWIPE_START_PX = 24

/** How far it has to travel. Short enough to be one flick, long enough that
 *  a horizontal nudge while scrolling the gallery is not a dismissal. */
export const EDGE_SWIPE_DISTANCE_PX = 60

export function createHomeEdgeSwipe() {
  return createDragHandler(
    (initEvent) => {
      // A finger or a pen, never a mouse. createDragHandler starts on button
      // 0 by default, and on the desktop web the leading 24px of Home is the
      // section rail's gutter, the brand text and the Overview button: a
      // left-button drag there popped the back registry and dropped the user
      // into the editor mid-drag. This gesture stands in for the back gesture
      // iOS does not have (DESIGN.md section 4), so a pointing device has no
      // business starting it.
      if (initEvent.pointerType === 'mouse') return undefined
      if (initEvent.clientX > EDGE_SWIPE_START_PX) return undefined
      const startX = initEvent.clientX
      let popped = false
      return {
        onPointerMove(event) {
          if (popped) return
          if (event.clientX - startX < EDGE_SWIPE_DISTANCE_PX) return
          // Once per gesture: the rest of the drag is the finger leaving.
          popped = true
          popBack()
        },
      }
    },
    // The gallery below still has to scroll, and its plates still have to be
    // tappable, so this gesture never swallows the events it watches.
    { preventDefault: false },
  )
}
