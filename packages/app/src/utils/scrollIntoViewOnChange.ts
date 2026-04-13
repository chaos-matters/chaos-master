import { createEffect } from 'solid-js'
import type { ChangeHistory } from '@/utils/createStoreHistory'

/**
 * Scrolls the element into view when a signal triggers.
 *
 * Used for navigating to the element which changes when
 * triggering undo / redo.
 *
 * Example:
 * ```tsx
 * const history = useChangeHistory()
 * const value = createMemo(() => ...)
 *
 * <input ref={(el) => {
 *   scrollIntoViewAndFocusOnChange(history, value, el)
 * }} />
 * ```
 */
export function scrollIntoViewAndFocusOnChange(
  history: ChangeHistory<any>,
  trigger: () => unknown,
  el: HTMLElement,
) {
  createEffect(
    () => trigger(),
    () => {
      if (
        !history.isUndoingOrRedoing() ||
        el.matches(':is(:active),:has(:active)')
      ) {
        // don't scroll if the user is actively manipulating the element
        // as this could cause an unexpected layout shift
        return
      }
      el.focus({ preventScroll: true })
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
  )
}
