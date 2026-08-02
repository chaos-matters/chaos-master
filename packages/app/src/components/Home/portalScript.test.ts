import { createRoot } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { example1CreationTour } from '@/tours/example1CreationTour'
import { applyStepsUpTo, applyWholeScript, createPortalDriver, PORTAL_HOLD_MS, PORTAL_MIN_STEP_MS, PORTAL_STEP_TAIL_MS, PORTAL_TIME_SCALE, runPortalScript, scriptDurationMs, stepDurationMs, } from './portalScript'
import type { TourGuide } from '@/components/SpotlightTour/tourTypes'

/**
 * The portal's whole claim is that it builds a real flame with the app's real
 * commands while touching nothing the workspace owns. Both halves are tested
 * here, without a GPU or a DOM — which is the only practical way to check the
 * isolation half at all.
 */

const tour = example1CreationTour

function transformCount(flame: { transforms: Record<string, unknown> }) {
  return Object.keys(flame.transforms).length
}

/** A tour of `count` steps that only takes time — no writes, no tweens. */
function inertTour(count: number): TourGuide {
  return {
    id: 'test',
    name: 'test',
    description: '',
    steps: Array.from({ length: count }, (_, i) => ({
      target: '',
      title: `step ${i}`,
      description: '',
    })),
  }
}

const twoSteps = inertTour(2)
const threeSteps = inertTour(3)

describe('createPortalDriver — the flame it builds', () => {
  it('replays the whole tour into the state the tour describes', () => {
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      applyWholeScript(tour, driver)

      // What example1-creation says it produces, in its own step titles: four
      // transforms, skip iterations 20, gamma 2.42, vibrancy 0.95.
      expect(transformCount(driver.flame)).toBe(4)
      expect(driver.flame.renderSettings.skipIters).toBe(20)
      expect(driver.flame.renderSettings.gamma).toBeCloseTo(2.42, 5)
      expect(driver.flame.renderSettings.vibrancy).toBeCloseTo(0.95, 5)
      // T1's probability and pre-affine, set by the first three steps.
      const first = Object.values(driver.flame.transforms)[0]
      expect(first?.probability).toBeCloseTo(0.4, 5)
      expect(first?.preAffine.a).toBeCloseTo(0.8, 5)
      dispose()
    })
  })

  it('starts blank: the first step clears the starting flame', () => {
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      expect(transformCount(driver.flame)).toBeGreaterThan(0)
      tour.steps[0]?.beforeShow?.(driver.ctx)
      expect(transformCount(driver.flame)).toBe(0)
      dispose()
    })
  })

  it('never mutates the example it was handed', () => {
    createRoot((dispose) => {
      const before = transformCount(examples.example1)
      const driver = createPortalDriver(examples.example1)
      applyWholeScript(tour, driver)
      expect(transformCount(examples.example1)).toBe(before)
      dispose()
    })
  })

  it('resets to the starting flame for the next loop', () => {
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const start = transformCount(examples.example1)
      applyWholeScript(tour, driver)
      expect(transformCount(driver.flame)).toBe(4)
      driver.reset()
      expect(transformCount(driver.flame)).toBe(start)
      expect(driver.flame.renderSettings.skipIters).toBe(
        examples.example1.renderSettings.skipIters,
      )
      dispose()
    })
  })

  it('runs the camera commands against its own view, not the flame', () => {
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const storedZoom = examples.example1.renderSettings.camera.zoom
      driver.ctx.executeCommand('camera.zoomTo', 2.5)
      expect(driver.zoom()).toBeCloseTo(2.5, 5)
      // The descriptor's own camera is untouched: zooming is a view change.
      expect(driver.flame.renderSettings.camera.zoom).toBeCloseTo(storedZoom, 5)
      dispose()
    })
  })
})

describe('createPortalDriver — isolation', () => {
  it('writes no localStorage while replaying the whole tour', () => {
    // The concrete hazard MainWorkspace-in-miniature would have: its
    // persistentSignals share localStorage keys with the user's real editor.
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      applyWholeScript(tour, driver)
      dispose()
    })
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('cannot reach the DOM: scrollToTarget is inert', () => {
    // A tour step's selector matches the REAL workspace behind Home, so a
    // scrollToTarget wired to the document would scroll the user's sidebar.
    const query = vi.spyOn(document, 'querySelector')
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      driver.ctx.scrollToTarget('[data-tour-target="probability"]')
      dispose()
    })
    expect(query).not.toHaveBeenCalled()
    query.mockRestore()
  })

  it('keeps two drivers independent', () => {
    createRoot((dispose) => {
      const a = createPortalDriver(examples.example1)
      const b = createPortalDriver(examples.example1)
      a.ctx.executeCommand('flame.clearTransforms')
      expect(transformCount(a.flame)).toBe(0)
      expect(transformCount(b.flame)).toBeGreaterThan(0)
      dispose()
    })
  })
})

describe('pacing', () => {
  it('scales the tour timings and floors a step at a readable length', () => {
    const instant = { target: '', title: '', description: '' }
    expect(stepDurationMs(instant)).toBe(PORTAL_MIN_STEP_MS)

    const animated = {
      ...instant,
      animationDelay: 500,
      onAnimate: () => {},
    }
    // 500ms grace + 1200ms tween, both scaled, plus the reading tail.
    expect(stepDurationMs(animated)).toBeCloseTo(
      (500 + 1200) * PORTAL_TIME_SCALE + PORTAL_STEP_TAIL_MS,
      5,
    )
  })

  it('reports a loop short enough to be ambient', () => {
    const seconds = scriptDurationMs(tour.steps) / 1000
    // Not a precise assertion — a guard rail. The tours are paced for a person
    // clicking Next; if a future edit pushes the portal past a minute it has
    // stopped being a section of a page and become a video.
    expect(seconds).toBeGreaterThan(15)
    expect(seconds).toBeLessThan(60)
  })
})

describe('runPortalScript', () => {
  it('plays steps in order and finishes', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      let finished = false
      const run = runPortalScript({
        tour: twoSteps,
        driver,
        onStep: (index) => seen.push(index),
        onFinished: () => {
          finished = true
        },
      })
      expect(seen).toEqual([0])
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS)
      expect(seen).toEqual([0, 1])
      expect(finished).toBe(false)
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS)
      expect(finished).toBe(true)
      run.cancel()
      dispose()
    })
    vi.useRealTimers()
  })

  it('stops dead when cancelled — which is how scrolling away pauses it', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      const run = runPortalScript({
        tour: threeSteps,
        driver,
        onStep: (index) => seen.push(index),
        onFinished: () => {},
      })
      run.cancel()
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS * 10)
      expect(seen).toEqual([0])
      dispose()
    })
    vi.useRealTimers()
  })

  it('loops: holds the finished flame, then plays again', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      const run = runPortalScript({
        tour: twoSteps,
        driver,
        onStep: (index) => seen.push(index),
      })
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS * 2)
      expect(seen).toEqual([0, 1])
      // The hold is the one moment the flame is allowed to converge; nothing
      // advances during it.
      vi.advanceTimersByTime(PORTAL_HOLD_MS - 1)
      expect(seen).toEqual([0, 1])
      vi.advanceTimersByTime(1)
      expect(seen).toEqual([0, 1, 0])
      run.cancel()
      dispose()
    })
    vi.useRealTimers()
  })
})

/**
 * The transport, which is what "a small scroll must not restart the build" is
 * made of: the portal stops and resumes a run rather than destroying and
 * recreating one, and the progress bar moves it about.
 */
describe('PortalScriptRun — transport', () => {
  it('holds where it is on pause and carries on from there', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      const run = runPortalScript({
        tour: threeSteps,
        driver,
        onStep: (index) => seen.push(index),
      })
      expect(seen).toEqual([0])
      run.pause()
      // However long the page sits below the play threshold, the step it was
      // showing is still the step it is showing.
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS * 20)
      expect(seen).toEqual([0])
      expect(run.stepIndex()).toBe(0)

      run.play()
      // Resumed, not restarted: the next thing that happens is step 1.
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS)
      expect(seen).toEqual([0, 1])
      run.cancel()
      dispose()
    })
    vi.useRealTimers()
  })

  it('ignores a second play, so a nudge cannot double the pace', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      const run = runPortalScript({
        tour: threeSteps,
        driver,
        onStep: (index) => seen.push(index),
      })
      run.play()
      run.play()
      run.play()
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS)
      expect(seen).toEqual([0, 1])
      run.cancel()
      dispose()
    })
    vi.useRealTimers()
  })

  it('starts from the beginning on restart, and only then', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      const run = runPortalScript({
        tour: threeSteps,
        driver,
        onStep: (index) => seen.push(index),
      })
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS)
      expect(seen).toEqual([0, 1])
      run.restart()
      expect(run.stepIndex()).toBe(0)
      expect(seen).toEqual([0, 1, 0])
      run.cancel()
      dispose()
    })
    vi.useRealTimers()
  })

  it('rebuilds the flame when seeking backwards', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const run = runPortalScript({
        tour,
        driver,
        onStep: () => {},
        autoStart: false,
      })

      run.seek(tour.steps.length - 1)
      const finished = transformCount(driver.flame)
      expect(finished).toBe(4)

      // Backwards is a REBUILD, not an undo: the tour's steps are writes, so
      // the only honest way to show step 3 is to replay steps 0..3.
      run.seek(3)
      expect(run.stepIndex()).toBe(3)
      expect(transformCount(driver.flame)).toBeLessThan(finished)

      // And forwards again lands on exactly the same flame as the first time.
      run.seek(tour.steps.length - 1)
      expect(transformCount(driver.flame)).toBe(finished)
      expect(driver.flame.renderSettings.vibrancy).toBeCloseTo(0.95, 5)
      run.cancel()
      dispose()
    })
    vi.useRealTimers()
  })

  it('keeps playing from where a seek landed', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      const run = runPortalScript({
        tour: threeSteps,
        driver,
        onStep: (index) => seen.push(index),
      })
      run.seek(2)
      expect(seen).toEqual([0, 2])
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS)
      // Step 2 is the last one, so the next thing is the hold.
      expect(seen).toEqual([0, 2])
      expect(run.isRunning()).toBe(true)
      run.cancel()
      dispose()
    })
    vi.useRealTimers()
  })

  it('seeks without advancing while paused — the scrubber in use', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      const run = runPortalScript({
        tour: threeSteps,
        driver,
        onStep: (index) => seen.push(index),
        autoStart: false,
      })
      run.seek(1)
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS * 10)
      expect(seen).toEqual([1])
      run.cancel()
      dispose()
    })
    vi.useRealTimers()
  })

  it('clamps a seek to the steps that exist', () => {
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const run = runPortalScript({
        tour: threeSteps,
        driver,
        onStep: () => {},
        autoStart: false,
      })
      run.seek(99)
      expect(run.stepIndex()).toBe(2)
      run.seek(-4)
      expect(run.stepIndex()).toBe(0)
      run.cancel()
      dispose()
    })
  })

  it('does nothing at all once cancelled', () => {
    vi.useFakeTimers()
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const seen: number[] = []
      const run = runPortalScript({
        tour: threeSteps,
        driver,
        onStep: (index) => seen.push(index),
      })
      run.cancel()
      run.play()
      run.seek(2)
      vi.advanceTimersByTime(PORTAL_MIN_STEP_MS * 10)
      expect(seen).toEqual([0])
      dispose()
    })
    vi.useRealTimers()
  })
})

describe('applyStepsUpTo', () => {
  it('builds the flame a prefix of the tour describes', () => {
    createRoot((dispose) => {
      const partial = createPortalDriver(examples.example1)
      applyStepsUpTo(tour, partial, 3)
      const whole = createPortalDriver(examples.example1)
      applyWholeScript(tour, whole)
      expect(transformCount(partial.flame)).toBeLessThan(
        transformCount(whole.flame),
      )
      dispose()
    })
  })

  it('applies nothing for a prefix before the first step', () => {
    createRoot((dispose) => {
      const driver = createPortalDriver(examples.example1)
      const before = transformCount(driver.flame)
      applyStepsUpTo(tour, driver, -1)
      expect(transformCount(driver.flame)).toBe(before)
      dispose()
    })
  })
})
