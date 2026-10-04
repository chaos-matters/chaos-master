import { afterEach, describe, expect, it, vi } from 'vitest'
import { jitterFor, nextAction, withTimeout } from './explorerSchedule'
import type { LoopState } from './explorerSchedule'

const finished: LoopState = {
  inFlight: false,
  iterating: true,
  samples: 1,
  sampleTarget: 8,
  refining: false,
  refineDone: false,
  colourChanged: false,
  now: 10_000,
  colourChangedAt: -Infinity,
  refineDelayMs: 300,
}

describe('nextAction', () => {
  it('waits for a step on the GPU, whatever else is pending', () => {
    expect(
      nextAction({ ...finished, inFlight: true, colourChanged: true }),
    ).toEqual({
      kind: 'idle',
    })
  })

  it('steps the main pass, presenting a colour change as it goes', () => {
    const main = { ...finished, samples: 0 }
    expect(nextAction(main)).toEqual({ kind: 'step' })
    expect(nextAction({ ...main, colourChanged: true })).toEqual({
      kind: 'step',
    })
  })

  it('recolours the backdrop while there is no reference yet', () => {
    const waiting = {
      ...finished,
      iterating: false,
      samples: 0,
      colourChanged: true,
    }
    expect(nextAction(waiting)).toEqual({ kind: 'recolour', finished: false })
    expect(nextAction({ ...waiting, colourChanged: false })).toEqual({
      kind: 'idle',
    })
  })

  it('shows a colour change at once, abandoning a supersample', () => {
    // A supersample can take as long as the whole picture; the colours must
    // not wait for it, and its result must not join the new average.
    expect(
      nextAction({ ...finished, refining: true, colourChanged: true }),
    ).toEqual({
      kind: 'recolour',
      finished: true,
    })
    expect(
      nextAction({ ...finished, refineDone: true, colourChanged: true }),
    ).toEqual({
      kind: 'recolour',
      finished: true,
    })
  })

  it('adds a finished supersample, and keeps stepping an unfinished one', () => {
    expect(nextAction({ ...finished, refineDone: true })).toEqual({
      kind: 'accumulate',
    })
    expect(nextAction({ ...finished, refining: true })).toEqual({
      kind: 'stepHidden',
    })
  })

  it('starts supersamples once the colours have been still', () => {
    expect(nextAction(finished)).toEqual({ kind: 'refine' })
    expect(nextAction({ ...finished, colourChangedAt: 9_900 })).toEqual({
      kind: 'later',
      ms: 200,
    })
  })

  it('stops at the target, and never supersamples on Fast', () => {
    expect(nextAction({ ...finished, samples: 8 })).toEqual({ kind: 'idle' })
    expect(nextAction({ ...finished, sampleTarget: 1 })).toEqual({
      kind: 'idle',
    })
  })
})

describe('jitterFor', () => {
  it('puts sample 0 at the centre and the rest inside the pixel, all distinct', () => {
    expect(jitterFor(0)).toEqual({ x: 0, y: 0 })
    const offsets = Array.from({ length: 16 }, (_, k) => jitterFor(k))
    for (const o of offsets) {
      expect(Math.abs(o.x)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(o.y)).toBeLessThanOrEqual(0.5)
    }
    expect(new Set(offsets.map((o) => `${o.x},${o.y}`)).size).toBe(16)
  })
})

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('passes a value on, and gives up on a promise that never settles', async () => {
    vi.useFakeTimers()
    await expect(withTimeout(Promise.resolve(3), 100)).resolves.toBe(3)
    const stuck = withTimeout(new Promise(() => undefined), 100)
    vi.advanceTimersByTime(100)
    await expect(stuck).resolves.toBeUndefined()
  })

  it('passes a rejection on', async () => {
    const failed = withTimeout(Promise.reject(new Error('lost')), 100)
    await expect(failed).rejects.toThrow('lost')
  })
})
