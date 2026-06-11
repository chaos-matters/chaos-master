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
  if (!el) return false
  // Always let the browser handle key events in text areas, selects, and contenteditable elements
  if (
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.getAttribute('contenteditable') === 'true' ||
    el.closest('[contenteditable="true"]')
  ) {
    return true
  }
  if (el.tagName !== 'INPUT') return false
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
