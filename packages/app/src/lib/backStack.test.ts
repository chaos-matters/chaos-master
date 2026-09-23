import { describe, expect, it, vi } from 'vitest'
import { backDepth, backLabels, holdBack, popBack, pushBackHandler, } from './backStack'

describe('backStack', () => {
  it('pops the most recently pushed handler first, once', () => {
    const calls: string[] = []
    const disposeSheet = pushBackHandler(() => calls.push('sheet'), 'sheet')
    const disposeMenu = pushBackHandler(() => calls.push('menu'), 'menu')
    expect(backDepth()).toBe(2)
    expect(popBack()).toBe(true)
    expect(calls).toEqual(['menu'])
    // A handler is not removed by being popped: the layer that pushed it
    // removes it when it actually closes. Here the menu never closed.
    expect(backDepth()).toBe(2)
    disposeMenu()
    expect(popBack()).toBe(true)
    expect(calls).toEqual(['menu', 'sheet'])
    disposeSheet()
    expect(backDepth()).toBe(0)
  })

  // The Arcade's screen lock holds back while the agent drives: popBack says
  // it was handled, so lib/lifecycle.ts does not minimise, and closes nothing.
  it('does nothing while held, until every hold is released', () => {
    const close = vi.fn()
    const layer = pushBackHandler(close, 'layer')
    const first = holdBack()
    const second = holdBack()

    expect(popBack()).toBe(true)
    first()
    first()
    expect(popBack()).toBe(true)
    expect(close).not.toHaveBeenCalled()

    second()
    expect(popBack()).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    layer()
    expect(popBack()).toBe(false)
  })

  it('returns false when nothing is registered, and never touches history', () => {
    const back = vi.spyOn(history, 'back')
    expect(popBack()).toBe(false)
    expect(back).not.toHaveBeenCalled()
  })

  it('disposing out of order removes the right entry', () => {
    const a = pushBackHandler(() => {}, 'a')
    const b = pushBackHandler(() => {}, 'b')
    const c = pushBackHandler(() => {}, 'c')
    b()
    expect(backLabels()).toEqual(['a', 'c'])
    a()
    c()
    expect(backLabels()).toEqual([])
  })

  it('disposing twice is harmless', () => {
    const a = pushBackHandler(() => {}, 'a')
    a()
    a()
    expect(backDepth()).toBe(0)
  })
})
