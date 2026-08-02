import { describe, expect, it } from 'vitest'
import { createCompletedThroughputTracker } from './completedThroughput'

describe('createCompletedThroughputTracker', () => {
  it('excludes the first completed submission', () => {
    const tracker = createCompletedThroughputTracker()
    expect(
      tracker.observe({ count: 1_000, completedAtMs: 100 }),
    ).toBeUndefined()
    expect(tracker.observe({ count: 4_000, completedAtMs: 400 })).toEqual({
      points: 3_000,
      elapsedMs: 300,
      pointsPerSecond: 10_000,
    })
  })

  it('ignores zero-duration and unchanged-count observations', () => {
    const tracker = createCompletedThroughputTracker()
    tracker.observe({ count: 10, completedAtMs: 10 })
    expect(tracker.observe({ count: 10, completedAtMs: 20 })).toBeUndefined()
    expect(tracker.observe({ count: 20, completedAtMs: 10 })).toBeUndefined()
  })

  it('starts a fresh window when accumulation resets', () => {
    const tracker = createCompletedThroughputTracker()
    tracker.observe({ count: 100, completedAtMs: 10 })
    tracker.observe({ count: 200, completedAtMs: 20 })
    expect(tracker.observe({ count: 25, completedAtMs: 30 })).toBeUndefined()
    expect(tracker.observe({ count: 125, completedAtMs: 40 })).toMatchObject({
      points: 100,
      elapsedMs: 10,
    })
  })

  it('can be reset explicitly', () => {
    const tracker = createCompletedThroughputTracker()
    tracker.observe({ count: 100, completedAtMs: 10 })
    tracker.reset()
    expect(tracker.observe({ count: 200, completedAtMs: 20 })).toBeUndefined()
  })
})
