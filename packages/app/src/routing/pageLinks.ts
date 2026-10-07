/**
 * Menu handlers that leave the editor for a page of its own, the Benchmark
 * Lab or the explorer. The pages are web only (DESIGN.md, decision 1), so
 * the native app is not offered them: its handlers are undefined, which
 * hides the menu items.
 *
 * Leaving is a plain same-tab navigation, so the editor's work reaches
 * Recents the way it does for any departure: the autosave's pagehide flush
 * (hooks/useWorkspaceAutosave.ts). Every way to either page, its item in
 * either menu (the touch layouts' More menu and the desktop version menu)
 * and, for the explorer, a deep-zoom PNG dropped on the editor, asks first
 * when that flush would push a kept flame off a full Recents
 * (`askBeforeLeaving`).
 */
import { formatExplorerHash } from '@chaos-master/core'
import { IS_NATIVE } from '@/lib/platform'
import { BENCHMARKS_PATH, EXPLORER_PATH } from './appPath'
import type { ExplorerLocation } from '@chaos-master/core'

/** The pages of their own the editor can be left for. */
export type LeavingFor = 'benchmarks' | 'explorer'

/**
 * The editor's say in leaving for a page of its own, while an editor is
 * open: resolves true to go, false to stay. Set by the editor's autosave for
 * as long as it is mounted, so the menu links and the drop, which know
 * nothing of Recents, ask the same question the same way.
 */
let mayLeave: ((page: LeavingFor) => Promise<boolean>) | undefined

/**
 * Has every way to a page of its own settle `ask` before it leaves. Returns
 * the disposer, which lets go only of this `ask`: a newer one stays.
 */
export function askBeforeLeaving(
  ask: (page: LeavingFor) => Promise<boolean>,
): () => void {
  mayLeave = ask
  return () => {
    if (mayLeave === ask) mayLeave = undefined
  }
}

/** Opens `url` in this tab, once the editor, if there is one, agrees. */
async function leaveFor(page: LeavingFor, url: string): Promise<void> {
  if (mayLeave !== undefined && !(await mayLeave(page))) return
  window.location.assign(url)
}

export const openBenchmarkLab: (() => void) | undefined = IS_NATIVE
  ? undefined
  : () => {
      void leaveFor('benchmarks', BENCHMARKS_PATH)
    }

export const openExplorer: (() => void) | undefined = IS_NATIVE
  ? undefined
  : () => {
      void leaveFor('explorer', EXPLORER_PATH)
    }

/**
 * Opens the explorer at a location, in this tab: what dropping a deep-zoom
 * PNG on the editor does. Settles once it has left or stayed. Undefined in
 * the native build, like the others.
 */
export const openExplorerAt:
  | ((location: ExplorerLocation) => Promise<void>)
  | undefined = IS_NATIVE
  ? undefined
  : (location) =>
      leaveFor('explorer', `${EXPLORER_PATH}${formatExplorerHash(location)}`)
