import { createEffect, onCleanup } from 'solid-js'

const letBrowserHandleInputTypes = new Set([
  'checkbox',
  'range',
  'button',
  'submit',
])
const letBrowserHandleCodes = new Set([
  'Space',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Tab',
])

function letBrowserHandleActiveInput(el: Element | null, ev: KeyboardEvent) {
  if (el?.tagName !== 'INPUT') {
    return false
  }
  const input = el as HTMLInputElement
  return (
    input.type === '' ||
    input.type === 'text' ||
    (letBrowserHandleInputTypes.has(input.type) &&
      letBrowserHandleCodes.has(ev.code))
  )
}

export function useKeyboardShortcuts(
  shortcuts: Record<string, (ev: KeyboardEvent) => boolean | undefined>,
) {
  createEffect(() => {
    function onKeydown(ev: KeyboardEvent) {
      if (letBrowserHandleActiveInput(document.activeElement, ev)) {
        return
      }
      const action = shortcuts[ev.code]
      if (action?.(ev) === true) {
        ev.preventDefault()
      }
    }
    document.addEventListener('keydown', onKeydown)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeydown)
    })
  })
}
