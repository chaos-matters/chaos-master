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

    vi.advanceTimersByTime(10_000)
    expect(store.toasts()).toHaveLength(0)
  })
})
