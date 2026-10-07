/**
 * The stage clock: frame steps, the cap that pauses a hidden tab, the limit
 * at the end of the bout.
 */
import { describe, expect, it } from 'vitest'
import { CLOCK_AT_START, MAX_CLOCK_STEP, tickClock } from './clashClock'

describe('tickClock', () => {
  it('starts on its first frame without moving', () => {
    const clock = tickClock(CLOCK_AT_START, 1000)
    expect(clock).toEqual({ elapsed: 0, last: 1000 })
  })

  it('advances by the time between frames', () => {
    let clock = tickClock(CLOCK_AT_START, 1000)
    clock = tickClock(clock, 1016)
    clock = tickClock(clock, 1033)
    expect(clock.elapsed).toBeCloseTo(0.033, 12)
  })

  it('takes at most one short step after a pause', () => {
    let clock = tickClock(CLOCK_AT_START, 0)
    clock = tickClock(clock, 60_000)
    expect(clock.elapsed).toBe(MAX_CLOCK_STEP)
  })

  it('never runs backwards and stops at its limit', () => {
    let clock = tickClock(CLOCK_AT_START, 500)
    clock = tickClock(clock, 400)
    expect(clock.elapsed).toBe(0)
    for (let now = 500; now < 3000; now += 16) clock = tickClock(clock, now, 1)
    expect(clock.elapsed).toBe(1)
  })
})
