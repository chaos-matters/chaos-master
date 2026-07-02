/**
 * Shared "should the browser keep this key event?" guard for BOTH keyboard
 * dispatchers (the command shortcut manager and the raw useKeyboardShortcuts
 * hook). Previously each kept its own copy and the fixes diverged: the copy
 * routing Ctrl+Z lacked the text-entry input types, so pressing Ctrl+Z while
 * typing in a number/search field (timeline FPS, export dimensions, variation
 * search) hijacked the keystroke into an app undo instead of reverting the
 * typo.
 */

// Input types with a free-text-editing cursor — same as type="text", the
// browser needs normal keyboard interaction (typing, select-all, copy/paste,
// native undo) uninterrupted by app shortcuts.
const textEntryInputTypes = new Set([
  'number',
  'email',
  'search',
  'tel',
  'url',
  'password',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
])

const letBrowserHandleInputTypes = new Set([
  'checkbox',
  'range',
  'button',
  'submit',
])

export function letBrowserHandleActiveInput(
  el: Element | null,
  ev: KeyboardEvent,
): boolean {
  if (!el) return false
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
    textEntryInputTypes.has(input.type) ||
    (letBrowserHandleInputTypes.has(input.type) &&
      (ev.code === 'Space' ||
        ev.code === 'Enter' ||
        ev.code.startsWith('Arrow')))
  )
}
