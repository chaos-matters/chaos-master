import { createRoot } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnimationFrame } from './createAnimationFrame'

// createAnimationFrame throttles the GPU queue with a `hold` promise. The
// failure modes these tests pin down are the ones that stalled the loop on iOS
// Safari: a hold that rejects, and a hold that never settles at all. In both
// cases the frame slot must be released so the loop keeps running.
describe('createAnimationFrame', () => {
  let rafCallbacks: FrameRequestCallback[]
  let now: number

  beforeEach(() => {
    // Fake ONLY setTimeout/clearTimeout so the hold-timeout path is
    // deterministic; drive requestAnimationFrame by hand for frame-accurate
    // control. Promise microtasks stay real, so hold().then still flushes.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    rafCallbacks = []
    now = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  // Advance one animation frame and flush the microtasks that hold().then
  // schedules, so framesPending bookkeeping settles before the next assertion.
  async function frame(dt = 16) {
    const cb = rafCallbacks.shift()
    if (cb === undefined) throw new Error('no animation frame scheduled')
    now += dt
    cb(now)
    await Promise.resolve()
    await Promise.resolve()
  }

  it('keeps rendering when the hold promise rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let ticks = 0
    const dispose = createRoot((d) => {
      createAnimationFrame(
        () => {
          ticks++
        },
        0,
        () => Promise.reject(new Error('onSubmittedWorkDone rejected')),
      )
      return d
    })
    await Promise.resolve() // let the effect schedule the first frame

    for (let i = 0; i < 8; i++) await frame()

    // Before the fix, a rejected hold leaked its framesPending entry and the
    // loop stalled at 3 ticks. Now every frame renders.
    expect(ticks).toBe(8)
    // The rejection is logged once (throttled), not once per frame.
    expect(warn).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('recovers via the timeout when a hold never settles', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let ticks = 0
    const dispose = createRoot((d) => {
      createAnimationFrame(
        () => {
          ticks++
        },
        0,
        () => new Promise<void>(() => {}), // never resolves or rejects
      )
      return d
    })
    await Promise.resolve()

    // framesPending fills to its cap of 3, then the loop stalls — a count-based
    // safety valve at >10 would never fire here.
    for (let i = 0; i < 8; i++) await frame()
    expect(ticks).toBe(3)

    // The per-hold timeout releases the stuck slots; the loop resumes.
    vi.advanceTimersByTime(2000)
    await Promise.resolve()
    for (let i = 0; i < 5; i++) await frame()
    expect(ticks).toBeGreaterThan(3)
    dispose()
  })

  it('redraw() forces a frame despite the min-delta throttle', async () => {
    let ticks = 0
    let loop!: ReturnType<typeof createAnimationFrame>
    const dispose = createRoot((d) => {
      loop = createAnimationFrame(() => {
        ticks++
      }, 100_000)
      return d
    })
    await Promise.resolve()

    await frame(16) // first frame: lastTime === 0, renders
    expect(ticks).toBe(1)
    await frame(16) // throttled: 16ms << 100s, no render
    expect(ticks).toBe(1)

    loop.redraw() // resets lastTime to 0
    await frame(16)
    expect(ticks).toBe(2)
    dispose()
  })
})
