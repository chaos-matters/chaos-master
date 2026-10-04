/**
 * The menu handlers that open a page of its own: on the web each one opens
 * its page in this tab. The native build, where they are undefined, is a
 * build-time constant these tests do not rebuild.
 */
import { DEFAULT_LOCATION, formatExplorerHash } from '@chaos-master/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BENCHMARKS_PATH, EXPLORER_PATH } from './appPath'
import { openBenchmarkLab, openExplorer, openExplorerAt } from './pageLinks'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('page links', () => {
  it.each([
    ['the Benchmark Lab', openBenchmarkLab, BENCHMARKS_PATH],
    ['the explorer', openExplorer, EXPLORER_PATH],
  ])('opens %s in this tab', (_, open, path) => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    expect(open).toBeTypeOf('function')
    open?.()
    expect(assign).toHaveBeenCalledExactlyOnceWith(path)
  })

  it('opens the explorer at a location in this tab', () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const julia = { ...DEFAULT_LOCATION, kind: 'julia' as const }
    openExplorerAt?.(julia)
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      `${EXPLORER_PATH}${formatExplorerHash(julia)}`,
    )
  })
})
