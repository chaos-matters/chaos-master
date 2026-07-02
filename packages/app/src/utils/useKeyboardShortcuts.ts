import { createEffect, onCleanup } from 'solid-js'
import { letBrowserHandleActiveInput } from '@/shortcuts/activeInputGuard'

export function useKeyboardShortcuts(
  shortcuts: Record<string, (ev: KeyboardEvent) => boolean | undefined>,
  options?: AddEventListenerOptions,
) {
  createEffect(() => {
    function onKeydown(ev: KeyboardEvent) {
      if (letBrowserHandleActiveInput(document.activeElement, ev)) {
        return
      }
      const action = shortcuts[ev.code]
      if (action?.(ev) === true) {
        ev.preventDefault()
        ev.stopImmediatePropagation()
      }
    }
    document.addEventListener('keydown', onKeydown, options)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeydown, options)
    })
  })
}
