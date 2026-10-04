/**
 * Menu handlers that leave the editor for a page of its own, the Benchmark
 * Lab or the explorer. The pages are web only (DESIGN.md, decision 1), so
 * the native app is not offered them: its handlers are undefined, which
 * hides the menu items.
 *
 * Leaving is a plain same-tab navigation, so the editor's work reaches
 * Recents the way it does for any departure: the autosave's pagehide flush
 * (hooks/useWorkspaceAutosave.ts).
 */
import { formatExplorerHash } from '@chaos-master/core'
import { IS_NATIVE } from '@/lib/platform'
import { BENCHMARKS_PATH, EXPLORER_PATH } from './appPath'
import type { ExplorerLocation } from '@chaos-master/core'

function opener(path: string): (() => void) | undefined {
  if (IS_NATIVE) return undefined
  return () => {
    window.location.assign(path)
  }
}

export const openBenchmarkLab = opener(BENCHMARKS_PATH)
export const openExplorer = opener(EXPLORER_PATH)

/**
 * Opens the explorer at a location, in this tab: what dropping a deep-zoom
 * PNG on the editor does. Undefined in the native build, like the others.
 */
export const openExplorerAt:
  | ((location: ExplorerLocation) => void)
  | undefined = IS_NATIVE
  ? undefined
  : (location) => {
      window.location.assign(`${EXPLORER_PATH}${formatExplorerHash(location)}`)
    }
