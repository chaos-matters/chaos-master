import { createEffect, onCleanup } from 'solid-js'
import { executeCommand, getAllCommands } from '@/commands/registry'
import { matchesShortcut, parseShortcut } from './shortcutParser'
import type { CommandContext } from '@/commands/types'

// Input types with a free-text-editing cursor — same as type="text", the
// browser needs normal keyboard interaction (typing, select-all, copy/paste)
// uninterrupted by app shortcuts.
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

export function useShortcutManager(ctx: CommandContext) {
  createEffect(() => {
    const commands = getAllCommands()
    const bindings = new Map<string, string>()

    for (const cmd of commands) {
      if (cmd.shortcut) {
        bindings.set(cmd.shortcut, cmd.id)
      }
    }

    if (bindings.size === 0) return

    function onKeydown(ev: KeyboardEvent) {
      if (letBrowserHandleActiveInput(document.activeElement, ev)) {
        return
      }

      for (const [shortcut, commandId] of bindings) {
        const parsed = parseShortcut(shortcut)
        if (parsed && matchesShortcut(ev, parsed)) {
          ev.preventDefault()
          ev.stopImmediatePropagation()
          executeCommand(commandId, ctx)
          return
        }
      }
    }

    document.addEventListener('keydown', onKeydown)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeydown)
    })
  })
}
