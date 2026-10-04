/**
 * The menu handlers that open a page of its own: on the web each one opens
 * its page in this tab. The native build, where they are undefined, is a
 * build-time constant these tests do not rebuild.
 */
import { DEFAULT_LOCATION, formatExplorerHash } from '@chaos-master/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BENCHMARKS_PATH, EXPLORER_PATH } from './appPath'
import { askBeforeLeavingForExplorer, openBenchmarkLab, openExplorer, openExplorerAt, } from './pageLinks'

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

  it('opens the explorer at a location in this tab', async () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const julia = { ...DEFAULT_LOCATION, kind: 'julia' as const }
    await openExplorerAt?.(julia)
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      `${EXPLORER_PATH}${formatExplorerHash(julia)}`,
    )
  })
})

describe('leaving for the explorer while the editor has a say', () => {
  const julia = { ...DEFAULT_LOCATION, kind: 'julia' as const }
  const disposers: (() => void)[] = []
  afterEach(() => {
    for (const dispose of disposers.splice(0)) dispose()
  })
  const editorSays = (answer: boolean) => {
    const ask = vi.fn(() => Promise.resolve(answer))
    disposers.push(askBeforeLeavingForExplorer(ask))
    return ask
  }

  it.each([
    ['the menu link', () => openExplorer?.(), EXPLORER_PATH],
    [
      'a dropped picture',
      () => openExplorerAt?.(julia),
      `${EXPLORER_PATH}${formatExplorerHash(julia)}`,
    ],
  ])('leaves by %s once the editor agrees', async (_, leave, url) => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const ask = editorSays(true)
    await leave()
    await vi.waitFor(() => {
      expect(assign).toHaveBeenCalledExactlyOnceWith(url)
    })
    expect(ask).toHaveBeenCalledOnce()
  })

  it.each([
    ['the menu link', () => openExplorer?.()],
    ['a dropped picture', () => openExplorerAt?.(julia)],
  ])('stays when the editor says no, by %s', async (_, leave) => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const ask = editorSays(false)
    await leave()
    await vi.waitFor(() => {
      expect(ask).toHaveBeenCalledOnce()
    })
    await Promise.resolve()
    expect(assign).not.toHaveBeenCalled()
  })

  it('asks nothing once the editor has gone, and keeps a newer editor', () => {
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    const older = vi.fn(() => Promise.resolve(false))
    const newer = vi.fn(() => Promise.resolve(false))
    const disposeOlder = askBeforeLeavingForExplorer(older)
    disposers.push(askBeforeLeavingForExplorer(newer))
    // The older one letting go must not take the newer one with it.
    disposeOlder()
    openExplorer?.()
    expect(newer).toHaveBeenCalledOnce()
    expect(older).not.toHaveBeenCalled()
    disposers.splice(0).forEach((dispose) => {
      dispose()
    })
    openBenchmarkLab?.()
    openExplorer?.()
    expect(assign).toHaveBeenLastCalledWith(EXPLORER_PATH)
  })
})
