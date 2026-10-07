/**
 * The URL fragment and the explorer's location stay in step: a link that is
 * followed while a debounced write is pending is not overwritten by it, a
 * jump is a browser entry of its own, a drag is not, and Back and Forward
 * walk the undo stack's jumps without recording anything.
 * (test/sessionHistory.ts stands in for the browser's list of entries.)
 */
import { DEFAULT_LOCATION, formatExplorerHash } from '@chaos-master/core'
import { createRoot } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionHistory as browserHistory } from '@/test/sessionHistory'
import { createExplorerLocation } from './explorerLocation'
import type { ExplorerLocation } from '@chaos-master/core'

const DRAGGED = { ...DEFAULT_LOCATION, maxIterations: 2000 }
const LINKED = { ...DEFAULT_LOCATION, kind: 'julia' as const }

let dispose: (() => void) | undefined

beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', '/explore')
})

afterEach(() => {
  dispose?.()
  vi.restoreAllMocks()
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

const sessionHistory = () => browserHistory('/explore')

const zoomed = (zoomLog2: number): ExplorerLocation => ({
  ...DEFAULT_LOCATION,
  view: { ...DEFAULT_LOCATION.view, zoomLog2 },
})

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

describe('createExplorerLocation and the browser history', () => {
  it('adds no entry for moves and colour changes, however many', () => {
    const session = sessionHistory()
    const { update } = mount()
    for (let i = 1; i <= 10; i += 1) {
      update({ view: zoomed(i).view })
      vi.advanceTimersByTime(1000)
    }
    update({ relief: 0.9 })
    vi.advanceTimersByTime(1000)
    expect(session.entries()).toEqual([
      formatExplorerHash({ ...zoomed(10), relief: 0.9 }),
    ])
  })

  it('pushes an entry for a jump at once, after writing the drag it leaves', () => {
    const session = sessionHistory()
    const { update, jump } = mount()
    update(DRAGGED)
    // Not yet settled when the jump comes.
    jump(LINKED)
    expect(session.entries()).toEqual([
      formatExplorerHash(DRAGGED),
      formatExplorerHash(LINKED),
    ])
    expect(session.index()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(session.entries()).toHaveLength(2)
  })

  it('pushes nothing for a jump to exactly where the view is', () => {
    const session = sessionHistory()
    const { jump } = mount()
    jump({ ...DEFAULT_LOCATION })
    vi.advanceTimersByTime(1000)
    expect(session.pushes()).toBe(0)
  })

  it('goes Back to the place a jump left, drags included, and Forward again', () => {
    const session = sessionHistory()
    const { location, update, jump, canUndo, canRedo } = mount()
    update({ view: zoomed(3).view })
    jump(LINKED)
    update({ view: { ...LINKED.view, zoomLog2: 5 } })
    vi.advanceTimersByTime(1000)

    session.back()
    expect(location()).toEqual(zoomed(3))
    // As far back as two undos: the drag after the jump waits as redo.
    expect(canUndo()).toBe(true)
    expect(canRedo()).toBe(true)

    session.forward()
    expect(location().kind).toBe('julia')
    expect(location().view.zoomLog2).toBe(5)
    expect(canRedo()).toBe(false)
    expect(session.pushes()).toBe(1)
  })

  it('records nothing for Back and Forward, so undo walks the same steps', () => {
    const session = sessionHistory()
    const { location, update, jump, undo } = mount()
    update({ view: zoomed(3).view })
    vi.advanceTimersByTime(1000)
    jump(LINKED)
    session.back()
    vi.advanceTimersByTime(1000)
    undo()
    expect(location()).toEqual(DEFAULT_LOCATION)
  })

  it('leaves the browser entries alone on undo and redo', () => {
    const session = sessionHistory()
    const { location, jump, undo, redo } = mount()
    jump(LINKED)
    undo()
    vi.advanceTimersByTime(1000)
    // The jump's entry now holds the place undo showed; none was popped.
    expect(session.entries()).toEqual([
      '',
      formatExplorerHash(DEFAULT_LOCATION),
    ])
    expect(session.index()).toBe(1)
    redo()
    vi.advanceTimersByTime(1000)
    expect(location().kind).toBe('julia')
    expect(session.entries()).toHaveLength(2)
    expect(session.pushes()).toBe(1)
  })

  it('makes a followed link a step, with only the entry the browser made', () => {
    const session = sessionHistory()
    const { location, undo, canUndo } = mount()
    session.follow(formatExplorerHash(DRAGGED))
    expect(location()).toEqual(DRAGGED)
    expect(session.pushes()).toBe(0)
    // Heard as popstate and as hashchange, recorded once.
    undo()
    expect(location()).toEqual(DEFAULT_LOCATION)
    expect(canUndo()).toBe(false)
  })

  it('treats a Forward to a place the stack no longer holds as a link', () => {
    const session = sessionHistory()
    const { location, update, jump, undo } = mount()
    jump(LINKED)
    session.back()
    // A new move clears redo, so the entry ahead is no undo step any more.
    update({ view: zoomed(2).view })
    vi.advanceTimersByTime(1000)
    session.forward()
    expect(location().kind).toBe('julia')
    undo()
    expect(location()).toEqual(zoomed(2))
  })
})
