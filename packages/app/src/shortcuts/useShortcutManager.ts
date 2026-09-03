import { createEffect, onCleanup } from 'solid-js'
import { drivingState } from '@/arcade/pilot'
import { executeCommand, getAllCommands } from '@/commands/registry'
import { letBrowserHandleActiveInput } from './activeInputGuard'
import { matchesShortcut, parseShortcut } from './shortcutParser'
import type { CommandContext } from '@/commands/types'

export { letBrowserHandleActiveInput } from './activeInputGuard'

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
      // The pilot owns the keyboard only while it owns the screen: the lock
      // would be theatre if Ctrl+E still opened an export or Ctrl+Z rewound
      // the take. A seat lock is the opposite case — the viewer is editing
      // their own half of a duel, and taking Ctrl+Z away from them for three
      // minutes would be the app fighting the person using it.
      if (drivingState()?.lock === 'screen') return
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
