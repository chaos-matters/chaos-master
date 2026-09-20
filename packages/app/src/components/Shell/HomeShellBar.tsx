import { Show } from 'solid-js'
import { deckFits, isTouchLayout } from '@/stores/workspaceLayoutStore'
import { goToDestination, shellDestination } from './destinations'
import { ShellBar } from './ShellBar'

/**
 * The shell over Home. A touch layout has no FloatingActions and no sidebar,
 * so without this Library is somewhere you can arrive and not leave; the
 * desktop keeps its own controls.
 *
 * Not on the deck layout: there the NavRail is the shell and stays exposed,
 * because Home is inset by its column (HomeTab.module.css `.deck`). Mounting
 * both would put a second, redundant bar over a rail that already works.
 *
 * More carries the Arcade: it is the one destination this phase does not put
 * in the bar, and Home is otherwise the screen that cannot reach it. The
 * shared list defaults it (Shell/moreMenuItems.ts), so there is nothing to pass.
 */
export function HomeShellBar() {
  return (
    <Show when={isTouchLayout() && !deckFits()}>
      <ShellBar
        mode="full"
        current={shellDestination}
        onSelect={goToDestination}
      />
    </Show>
  )
}
