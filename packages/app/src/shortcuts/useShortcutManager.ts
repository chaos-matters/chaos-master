import { createEffect, onCleanup } from 'solid-js'
import { agentDriving } from '@/arcade/pilot'
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
      // The pilot owns the keyboard while an agent drives: the lock would be
      // theatre if Ctrl+E still opened an export or Ctrl+Z rewound the take.
      if (agentDriving()) return
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
