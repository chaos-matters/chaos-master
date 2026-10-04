/**
 * The timing curve and the eased value the camera's framing above the rail's
 * glass sheet moves by (easing.ts). The curve is checked against a solution
 * found a different way, by sampling it densely, and the value by driving
 * animation frames by hand.
 */
import { createRoot, createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEasedValue, cubicBezier } from './easing'
import type { CubicBezierPoints } from './easing'

/** --la-ease (lumen.css), the curve the sheet takes to a detent. */
const ARRIVAL: CubicBezierPoints = [0.16, 1, 0.3, 1]

/** y at x on the curve, by sampling its parameter finely: no solver involved. */
function sampledProgress([x1, y1, x2, y2]: CubicBezierPoints, x: number) {
  const point = (s: number, a: number, b: number) =>
    3 * a * s * (1 - s) ** 2 + 3 * b * s ** 2 * (1 - s) + s ** 3
  let best = 0
  for (let i = 0; i <= 200_000; i++) {
    const s = i / 200_000
    if (Math.abs(point(s, x1, x2) - x) < Math.abs(point(best, x1, x2) - x)) {
      best = s
    }
  }
  return point(best, y1, y2)
}

describe('cubicBezier', () => {
  it('runs from 0 to 1 and holds there outside the curve', () => {
    const ease = cubicBezier(ARRIVAL)
    expect(ease(0)).toBe(0)
    expect(ease(1)).toBe(1)
    expect(ease(-0.5)).toBe(0)
    expect(ease(1.5)).toBe(1)
    expect(ease(Number.NaN)).toBe(0)
  })

  it('is the identity for the linear curve', () => {
    const linear = cubicBezier([0, 0, 1, 1])
    for (const time of [0.1, 0.25, 0.5, 0.9]) {
      expect(linear(time)).toBeCloseTo(time, 6)
    }
  })

  it('matches the curve sampled directly', () => {
    for (const points of [ARRIVAL, [0.4, 0, 1, 1], [0.2, 0, 0, 1]] as const) {
      const ease = cubicBezier(points)
      for (const time of [0.05, 0.2, 0.35, 0.5, 0.75, 0.95]) {
        expect(ease(time)).toBeCloseTo(sampledProgress(points, time), 4)
      }
    }
  })

  it('arrives early, as --la-ease does', () => {
    // Most of the move is done in the first third: the flame gets to where
    // the sheet is going about as soon as the sheet does.
    const ease = cubicBezier(ARRIVAL)
    expect(ease(1 / 3)).toBeGreaterThan(0.85)
    let previous = 0
    for (let i = 1; i <= 100; i++) {
      const next = ease(i / 100)
      expect(next).toBeGreaterThanOrEqual(previous)
      previous = next
    }
  })
})

describe('createEasedValue', () => {
  let frames: FrameRequestCallback[]
  let now: number

  beforeEach(() => {
    frames = []
    now = 0
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames[id - 1] = () => {}
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Runs the frames due now, `dt` ms after the last. */
  function frame(dt: number) {
    now += dt
    const due = frames
    frames = []
    for (const callback of due) callback(now)
  }

  function mount(instant = false) {
    const [target, setTarget] = createSignal(0)
    const [isInstant, setInstant] = createSignal(instant)
    let value!: () => number
    const dispose = createRoot((dispose) => {
      value = createEasedValue(target, {
        durationMs: 280,
        easing: cubicBezier(ARRIVAL),
        instant: isInstant,
      })
      return dispose
    })
    return { value: () => value(), setTarget, setInstant, dispose }
  }

  it('starts at its target, with no move', () => {
    const eased = mount()
    expect(eased.value()).toBe(0)
    expect(frames).toHaveLength(0)
    eased.dispose()
  })

  it('moves to a new target along the curve, a frame at a time', () => {
    const eased = mount()
    eased.setTarget(100)
    expect(eased.value()).toBe(0)
    frame(16)
    // The first frame writes where the move starts.
    expect(eased.value()).toBe(0)
    frame(70)
    expect(eased.value()).toBeCloseTo(100 * cubicBezier(ARRIVAL)(70 / 280), 6)
    frame(70)
    expect(eased.value()).toBeCloseTo(100 * cubicBezier(ARRIVAL)(140 / 280), 6)
    frame(140)
    expect(eased.value()).toBe(100)
    expect(frames).toHaveLength(0)
    eased.dispose()
  })

  it('turns back from wherever it had got to', () => {
    const eased = mount()
    eased.setTarget(100)
    frame(16)
    frame(70)
    const reached = eased.value()
    expect(reached).toBeGreaterThan(0)
    eased.setTarget(0)
    frame(16)
    expect(eased.value()).toBe(reached)
    frame(280)
    expect(eased.value()).toBe(0)
    eased.dispose()
  })

  it('jumps while instant holds, as a reduced-motion transition does', () => {
    const eased = mount(true)
    eased.setTarget(100)
    expect(eased.value()).toBe(100)
    expect(frames).toHaveLength(0)
    eased.setInstant(false)
    eased.setTarget(0)
    expect(eased.value()).toBe(100)
    eased.dispose()
  })

  it('stops its frames when disposed', () => {
    const eased = mount()
    eased.setTarget(100)
    frame(16)
    eased.dispose()
    const last = eased.value()
    frame(280)
    expect(eased.value()).toBe(last)
  })
})
