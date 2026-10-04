/**
 * Menu handlers that leave the editor for a page of its own, the Benchmark
 * Lab or the explorer. The pages are web only (DESIGN.md, decision 1), so
 * the native app is not offered them: its handlers are undefined, which
 * hides the menu items.
 */
import { IS_NATIVE } from '@/lib/platform'
import { BENCHMARKS_PATH, EXPLORER_PATH } from './appPath'

function opener(path: string): (() => void) | undefined {
  if (IS_NATIVE) return undefined
  return () => {
    window.location.assign(path)
  }
}

export const openBenchmarkLab = opener(BENCHMARKS_PATH)
export const openExplorer = opener(EXPLORER_PATH)
