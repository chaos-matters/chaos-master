import { describe, expect, it, vi } from 'vitest'
import { deepClone } from '@/utils/clone'
import { createGlideRuntime, glideEnabled, glideQualityPreference, setGlideEnabled, setGlideQualityPreference, } from './runtime'
import { makeFlame } from './testUtils'
import { GLIDE_DEADLINE_SLACK_MS } from './types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * The live driver, on a clock the test owns.
 *
 * Every write goes through `writeFlame`, which the workspace maps to
 * `history.replaceSilently` — so what this asserts about the sequence of
 * writes is what the document actually sees.
 */
function harness(
  start: FlameDescriptor,
  /** `stalledFrames`: a hidden tab, which takes the request and never calls
   *  back. The only clock left is the wall clock. */
  options: { stalledFrames?: boolean } = {},
) {
  let flame = deepClone(start)
  let time = 0
  let pending: ((time: number) => void)[] = []
  const writes: FlameDescriptor[] = []
  const runtime = createGlideRuntime({
    readFlame: () => deepClone(flame),
    writeFlame: (next) => {
      flame = deepClone(next)
      writes.push(deepClone(next))
    },
    now: () => time,
    requestFrame: (callback) => {
      if (options.stalledFrames === true) return 0
      pending.push(callback)
      return pending.length
    },
    cancelFrame: () => {
      pending = []
    },
  })
  return {
    runtime,
    writes,
    read: () => flame,
    set: (next: FlameDescriptor) => {
      flame = deepClone(next)
    },
    advance: (ms: number) => {
      time += ms
      const due = pending
      pending = []
      for (const callback of due) callback(time)
    },
  }
}

const A = makeFlame({
  transforms: { one: { probability: 1, preAffine: { c: 0 } } },
  renderSettings: { gamma: 2 },
})
const B = makeFlame({
  transforms: { one: { probability: 1, preAffine: { c: 4 } } },
  renderSettings: { gamma: 4 },
})

function gammaOf(flame: FlameDescriptor): number {
  return flame.renderSettings.gamma
}

describe('createGlideRuntime', () => {
  it('writes frame 0 immediately and lands on exactly the target', async () => {
    const world = harness(A)
    world.set(B)
    const done = world.runtime.glideFrom(A, { durationMs: 400 })
    expect(gammaOf(world.read())).toBeCloseTo(2, 9)
    expect(world.runtime.isGliding()).toBe(true)

    world.advance(200)
    const midway = gammaOf(world.read())
    expect(midway).toBeGreaterThan(2)
    expect(midway).toBeLessThan(4)

    world.advance(200)
    expect(world.runtime.isGliding()).toBe(false)
    expect(world.read()).toEqual(B)
    await done
  })

  it('reports a plan while it runs and nothing once it settles', async () => {
    const world = harness(A)
    world.set(B)
    const done = world.runtime.glideFrom(A, { durationMs: 400 })
    expect(world.runtime.activePlan()?.settle).toEqual(B)
    expect(world.runtime.activeQuality()?.tier).toBeDefined()
    world.advance(500)
    expect(world.runtime.activePlan()).toBeUndefined()
    expect(world.runtime.activeQuality()).toBeUndefined()
    await done
  })

  it('settles for the next change and hands back what the viewer can see', async () => {
    const world = harness(A)
    world.set(B)
    const done = world.runtime.glideFrom(A, { durationMs: 400 })
    world.advance(200)
    const visible = world.runtime.settleForNextChange()
    expect(visible).toBeDefined()
    // The intermediate the eye was on, so the next glide starts from there...
    expect(gammaOf(visible!)).toBeGreaterThan(2)
    expect(gammaOf(visible!)).toBeLessThan(4)
    // ...while the document itself has landed, so the next edit is made to the
    // state the change actually reached.
    expect(world.read()).toEqual(B)
    expect(world.runtime.isGliding()).toBe(false)
    await done
  })

  it('returns nothing to settle when nothing is in flight', () => {
    const world = harness(A)
    expect(world.runtime.settleForNextChange()).toBeUndefined()
  })

  it('cancel leaves the document where it reached, finish lands it', async () => {
    const cancelled = harness(A)
    cancelled.set(B)
    const first = cancelled.runtime.glideFrom(A, { durationMs: 400 })
    cancelled.advance(200)
    cancelled.runtime.cancel()
    expect(cancelled.read()).not.toEqual(B)
    await first

    const finished = harness(A)
    finished.set(B)
    const second = finished.runtime.glideFrom(A, { durationMs: 400 })
    finished.advance(200)
    finished.runtime.finish()
    expect(finished.read()).toEqual(B)
    await second
  })

  /**
   * The wall-clock deadline.
   *
   * `requestAnimationFrame` is an animation clock, not a timer: Chrome stops
   * running it in a tab that is not visible. Our own automation browser lives
   * on a hidden workspace, so this is the ordinary case rather than the exotic
   * one — and a glide clocked by rAF alone leaves the document on frame 0 and
   * the awaiting tool call pending for as long as the tab stays hidden.
   */
  describe('when the animation clock never runs', () => {
    it('lands exactly on the target, on the wall clock', async () => {
      vi.useFakeTimers()
      try {
        const world = harness(A, { stalledFrames: true })
        world.set(B)
        const done = world.runtime.glideFrom(A, { durationMs: 400 })
        // Frame 0 is written the moment the glide starts, so the document is
        // sitting at A's gamma with nothing on the way to move it.
        expect(gammaOf(world.read())).toBeCloseTo(2, 9)
        expect(world.runtime.isGliding()).toBe(true)

        // A healthy tab gets its own duration plus one frame's grace first.
        vi.advanceTimersByTime(400)
        expect(world.runtime.isGliding()).toBe(true)

        vi.advanceTimersByTime(GLIDE_DEADLINE_SLACK_MS)
        expect(world.runtime.isGliding()).toBe(false)
        expect(world.read()).toEqual(B)

        const outcome = await done
        expect(outcome?.completedByDeadline).toBe(true)
        expect(outcome?.plan.settle).toEqual(B)
      } finally {
        vi.useRealTimers()
      }
    })

    it('leaves the deadline alone when the animation does arrive', async () => {
      vi.useFakeTimers()
      try {
        const world = harness(A)
        world.set(B)
        const done = world.runtime.glideFrom(A, { durationMs: 400 })
        world.advance(400)
        expect(world.runtime.isGliding()).toBe(false)

        const outcome = await done
        expect(outcome?.completedByDeadline).toBe(false)
        // The deadline was cancelled with the rest of the clock: nothing
        // writes the settle a second time.
        const writesAfterLanding = world.writes.length
        vi.advanceTimersByTime(10_000)
        expect(world.writes).toHaveLength(writesAfterLanding)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it('glideTo animates from the document to the target', async () => {
    const world = harness(A)
    const done = world.runtime.glideTo(B, { durationMs: 400 })
    world.advance(200)
    expect(gammaOf(world.read())).toBeGreaterThan(2)
    world.advance(200)
    expect(world.read()).toEqual(B)
    await done
  })

  it('arrives at once when the pair cannot be glided', async () => {
    const world = harness(A)
    const threeD = makeFlame({
      transforms: { one: {} },
      renderSettings: { dimensions: 3 },
    })
    world.set(threeD)
    const outcome = await world.runtime.glideFrom(A, { durationMs: 400 })
    // A refusal is not a failure to change the document.
    expect(outcome).toBeUndefined()
    expect(world.read()).toEqual(threeD)
    expect(world.runtime.isGliding()).toBe(false)
  })

  it('arrives at once when nothing differs', async () => {
    const world = harness(A)
    const outcome = await world.runtime.glideFrom(deepClone(A), {
      durationMs: 400,
    })
    expect(outcome?.plan.changeClass).toBe('none')
    expect(world.runtime.isGliding()).toBe(false)
    expect(world.read()).toEqual(A)
  })

  it('resolves the tier from the preference and the workspace preset', () => {
    const world = harness(A)
    expect(world.runtime.quality().tier).toBe('responsive')
    setGlideQualityPreference('full')
    expect(world.runtime.quality().tier).toBe('full')
    expect(world.runtime.quality().accumulationScale).toBe(1)
    setGlideQualityPreference('auto')
  })
})

/**
 * A second start while one glide is still in flight.
 *
 * Only one glide can run, so the one already running has to be FINISHED, not
 * dropped: its caller is awaiting it, its wall-clock deadline is armed, and
 * the document holds one of its frames rather than the state it was heading
 * for. Dropping it left all three behind (code audit 2026-09-23, F1): the
 * promise never resolved, the deadline later landed whatever glide was running
 * at that moment, and the new glide read its target off the old one's frame.
 */
describe('a glide that replaces one in flight', () => {
  const C = makeFlame({
    transforms: { one: { probability: 1, preAffine: { c: -3 } } },
    renderSettings: { gamma: 1 },
  })

  it('finishes the replaced glide, so its caller hears back', async () => {
    const world = harness(A)
    world.set(B)
    let firstOutcome: unknown = 'pending'
    void world.runtime
      .glideFrom(A, { durationMs: 400 })
      .then((outcome) => (firstOutcome = outcome))
    world.advance(100)
    const second = world.runtime.glideFrom(C, { durationMs: 400 })
    await Promise.resolve()
    expect(firstOutcome).toMatchObject({ completedByDeadline: false })
    world.advance(400)
    await second
  })

  it('reads its target from the settled document, not from a frame', async () => {
    const world = harness(A)
    world.set(B)
    void world.runtime.glideFrom(A, { durationMs: 400 })
    // The document holds the first glide's frame 0, which is A. The change
    // the first glide was presenting is B, and that is where the second one
    // has to land.
    const second = world.runtime.glideFrom(C, { durationMs: 400 })
    world.advance(400)
    await second
    expect(world.runtime.isGliding()).toBe(false)
    expect(world.read()).toEqual(B)
  })

  it('glideTo also lands the replaced glide before reading its start', async () => {
    const world = harness(A)
    world.set(B)
    let firstOutcome: unknown = 'pending'
    void world.runtime
      .glideFrom(A, { durationMs: 400 })
      .then((outcome) => (firstOutcome = outcome))
    const second = world.runtime.glideTo(C, { durationMs: 400 })
    await Promise.resolve()
    expect(firstOutcome).toMatchObject({ completedByDeadline: false })
    world.advance(400)
    await second
    expect(world.read()).toEqual(C)
  })

  it('leaves no deadline armed to cut the next glide short', async () => {
    vi.useFakeTimers()
    try {
      const world = harness(A)
      world.set(B)
      void world.runtime.glideFrom(A, { durationMs: 400 })
      const second = world.runtime.glideFrom(C, { durationMs: 2000 })
      let secondOutcome: { completedByDeadline: boolean } | undefined
      void second.then((outcome) => (secondOutcome = outcome))
      // A healthy animation clock, ticking well past where the replaced
      // glide's own deadline (400 ms + slack) would have fired.
      for (let t = 0; t < 400 + GLIDE_DEADLINE_SLACK_MS + 200; t += 16) {
        vi.advanceTimersByTime(16)
        world.advance(16)
      }
      await Promise.resolve()
      expect(world.runtime.isGliding()).toBe(true)
      expect(secondOutcome).toBeUndefined()
      for (let t = 0; t < 2000; t += 16) {
        vi.advanceTimersByTime(16)
        world.advance(16)
      }
      await second
      expect(secondOutcome?.completedByDeadline).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the global mode switches', () => {
  it('starts off, which is how the editor has always behaved', () => {
    expect(glideEnabled()).toBe(false)
    expect(glideQualityPreference()).toBe('auto')
  })

  it('round-trips', () => {
    setGlideEnabled(true)
    expect(glideEnabled()).toBe(true)
    setGlideEnabled(false)
    setGlideQualityPreference('balanced')
    expect(glideQualityPreference()).toBe('balanced')
    setGlideQualityPreference('auto')
  })
})
