import { createEffect, createRoot, createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createToastStore } from './ToastContext'

// The rules that matter for the toast column: plain toasts auto-hide, sticky
// question toasts never do (they wait for an answer), duplicates restart the
// timer instead of stacking, and the cap only ever evicts auto-hiding toasts.
describe('createToastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-dismisses a plain toast after the default duration', () => {
    const store = createToastStore()
    store.showToast('Saved')
    expect(store.toasts()).toHaveLength(1)

    vi.advanceTimersByTime(4000)
    expect(store.toasts()).toHaveLength(0)
  })

  it('keeps a sticky toast up until it is dismissed explicitly', () => {
    const store = createToastStore()
    const id = store.showToast('Auto-save?', 'sticky', [
      { label: 'Yes', onClick: () => {} },
      { label: 'No', onClick: () => {} },
    ])

    vi.advanceTimersByTime(10 * 60_000)
    expect(store.toasts()).toHaveLength(1)

    store.dismissToast(id)
    expect(store.toasts()).toHaveLength(0)
  })

  it('restarts the timer for a repeated plain message instead of stacking', () => {
    const store = createToastStore()
    const first = store.showToast('Link copied')
    vi.advanceTimersByTime(3000)

    const second = store.showToast('Link copied')
    expect(second).toBe(first)
    expect(store.toasts()).toHaveLength(1)

    // 3s + 2s = past the original deadline; the restarted timer keeps it up.
    vi.advanceTimersByTime(2000)
    expect(store.toasts()).toHaveLength(1)
    vi.advanceTimersByTime(2000)
    expect(store.toasts()).toHaveLength(0)
  })

  it('evicts the oldest auto-hiding toast at the cap, never a sticky one', () => {
    const store = createToastStore()
    const sticky = store.showToast('Question?', 'sticky', [
      { label: 'Yes', onClick: () => {} },
    ])
    store.showToast('a')
    store.showToast('b')
    store.showToast('c')
    store.showToast('d')

    const messages = store.toasts().map((t) => t.message)
    expect(store.toasts()).toHaveLength(4)
    expect(messages).toContain('Question?')
    expect(messages).not.toContain('a')

    store.dismissToast(sticky)
    expect(store.toasts()).toHaveLength(3)
  })

  it('evicts a plain toast before one carrying actions', () => {
    // The custom-variation delete toast offers Undo as its ONLY recovery
    // path, so a burst of routine status lines must not push it out.
    const store = createToastStore()
    const undo = store.showToast('Deleted "spiral"', 10_000, [
      { label: 'Undo', onClick: () => {} },
    ])
    store.showToast('a')
    store.showToast('b')
    store.showToast('c')
    store.showToast('d')

    const messages = store.toasts().map((t) => t.message)
    expect(messages).toContain('Deleted "spiral"')
    expect(messages).not.toContain('a')
    expect(store.toasts().find((t) => t.id === undo)).toBeDefined()
  })

  it('stays bounded even when every slot is sticky', () => {
    const store = createToastStore()
    for (let i = 0; i < 8; i++) {
      store.showToast(`Q${i}`, 'sticky', [{ label: 'Ok', onClick: () => {} }])
    }
    // Without a final fallback the cap silently stops applying and the column
    // grows without limit.
    expect(store.toasts().length).toBeLessThanOrEqual(4)
  })

  it('never strands a sticky toast that has no way to be answered', () => {
    // sticky + no actions = no timer AND no clickable control (plain toasts
    // are pointer-events: none), which would pin it for the whole session.
    const store = createToastStore()
    store.showToast('Orphan', 'sticky')
    expect(store.toasts()).toHaveLength(1)
    expect(store.toasts()[0]?.sticky).toBe(false)

    vi.advanceTimersByTime(4000)
    expect(store.toasts()).toHaveLength(0)
  })

  it('uses the longer default duration for action toasts', () => {
    const store = createToastStore()
    store.showToast('Deleted', undefined, [
      { label: 'Undo', onClick: () => {} },
    ])
    vi.advanceTimersByTime(4000)
    expect(store.toasts()).toHaveLength(1)
    vi.advanceTimersByTime(8000)
    expect(store.toasts()).toHaveLength(0)
  })

  it('does not dedupe toasts that carry actions', () => {
    const store = createToastStore()
    store.showToast('Deleted', 10_000, [{ label: 'Undo', onClick: () => {} }])
    store.showToast('Deleted', 10_000, [{ label: 'Undo', onClick: () => {} }])
    // Two separate deletions each need their own Undo.
    expect(store.toasts()).toHaveLength(2)
  })

  it('does not subscribe a calling effect to the toast list', () => {
    // Regression: showToast reads the list (dedupe/eviction). Without
    // untrack, a caller like QueryErrorToast — showToast inside a
    // createEffect — gets subscribed, and the timer-driven removal re-runs
    // the effect, which re-shows the toast forever.
    const store = createToastStore()
    let effectRuns = 0
    const dispose = createRoot((d) => {
      const [error] = createSignal('boom')
      createEffect(() => {
        effectRuns++
        store.showToast(error())
      })
      return d
    })

    expect(effectRuns).toBe(1)
    vi.advanceTimersByTime(4000)
    expect(store.toasts()).toHaveLength(0)
    // The removal must not have re-triggered the effect (which would have
    // re-shown the toast).
    expect(effectRuns).toBe(1)
    dispose()
  })

  it('dismisses everything (and clears timers) with no id', () => {
    const store = createToastStore()
    store.showToast('one')
    store.showToast('two', 'sticky', [{ label: 'Ok', onClick: () => {} }])
    store.dismissToast()
    expect(store.toasts()).toHaveLength(0)

    // Assert on the timer itself: checking the list stays empty would pass
    // even with a leaked timeout, since firing it just removes an absent id.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('dismissing an unknown id is a no-op', () => {
    const store = createToastStore()
    store.showToast('one')
    store.dismissToast(9999)
    expect(store.toasts()).toHaveLength(1)
  })
})
