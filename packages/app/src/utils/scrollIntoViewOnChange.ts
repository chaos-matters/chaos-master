import { createEffect, on } from 'solid-js'

/**
 * Scrolls the element into view when a signal triggers.
 *
 * Used for navigating to the element which changes when
 * triggering undo / redo.
 *
 * Example:
 * ```tsx
 * const value = createMemo(() => ...)
 *
 * <input ref={(el) => {
 *   scrollIntoViewAndFocusOnChange(value, el)
 * }} />
 * ```
 */
export function scrollIntoViewAndFocusOnChange(
  trigger: () => unknown,
  el: HTMLElement,
) {
  createEffect(
    on(
      trigger,
      () => {
        if (el.matches(':is(:active),:has(:active)')) {
          // don't scroll if the user is actively manipulating the element
          // as this could cause an unexpected layout shift
          return
        }
        el.focus({ preventScroll: true })
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      },
      { defer: true },
    ),
  )
}
