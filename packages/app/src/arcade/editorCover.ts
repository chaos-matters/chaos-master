// Whether a view with its own top bar is over the editor, so a first-run question can wait for the viewer to come back.
import { createSignal } from 'solid-js'
import { activeTab } from '@/lib/activeTab'
import { duelShowing } from './duel'
import { pilot } from './pilot'

/**
 * The Arena is local state of the workspace (hooks/useWorkspaceArena.ts),
 * which mirrors it here so code outside the workspace can read it.
 */
const [arenaShowing, setArenaShowing] = createSignal(false)
export { setArenaShowing }

/**
 * True while the editor is not what the viewer is looking at: Home or the
 * Arcade hub is the active tab, the Arena is open, a duel is on screen, or an
 * Arcade session (Cinema, Lessons, Beats) is running or showing its result.
 *
 * Each of these has its own top bar in the top-right corner, where the toast
 * column is: a question raised there covers the view's own controls, as the
 * auto-save question covered Exit Arena.
 */
export function editorCovered(): boolean {
  return (
    activeTab() !== 'workspace' ||
    arenaShowing() ||
    duelShowing() ||
    pilot().phase !== 'idle'
  )
}
