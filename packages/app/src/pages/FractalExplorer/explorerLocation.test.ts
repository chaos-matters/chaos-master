/**
 * The URL fragment and the explorer's location stay in step: a link that is
 * followed while a debounced write is pending is not overwritten by it.
 */
import { DEFAULT_LOCATION, formatExplorerHash } from '@chaos-master/core'
import { createRoot } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExplorerLocation } from './explorerLocation'

const DRAGGED = { ...DEFAULT_LOCATION, maxIterations: 2000 }
const LINKED = { ...DEFAULT_LOCATION, kind: 'julia' as const }

let dispose: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', '/explore')
})

afterEach(() => {
  dispose?.()
  vi.useRealTimers()
})

/** Outside the root's own update, so each change runs its effect at once. */
function mount() {
  return createRoot((d) => {
    dispose = d
    return createExplorerLocation()
  })
}

function follow(hash: string) {
  window.history.replaceState(null, '', `/explore${hash}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

describe('createExplorerLocation', () => {
  it('writes a change to the fragment once it settles', () => {
    const { update } = mount()
    update(DRAGGED)
    expect(window.location.hash).toBe('')
    vi.advanceTimersByTime(1000)
    expect(window.location.hash).toBe(formatExplorerHash(DRAGGED))
  })

  it('lets a followed link win over a write still pending', () => {
    const { location, update } = mount()
    update(DRAGGED)
    follow(formatExplorerHash(LINKED))
    vi.advanceTimersByTime(1000)
    expect(location().kind).toBe('julia')
    expect(window.location.hash).toBe(formatExplorerHash(LINKED))
  })

  it('drops a pending write when the location comes back to the URL', () => {
    const { update } = mount()
    update(DRAGGED)
    update(DEFAULT_LOCATION)
    vi.advanceTimersByTime(1000)
    expect(window.location.hash).toBe('')
  })
})
