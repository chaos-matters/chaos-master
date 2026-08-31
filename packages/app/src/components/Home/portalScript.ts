// Registers the commands the tours execute. MainWorkspace imports this too, but
// the portal must not depend on the workspace having been loaded first: the
// registry is a module-global Map, and an unregistered id is a silent no-op —
// which would look exactly like a tour step that does nothing.
import '@/commands/builtins'
import { createSignal } from 'solid-js'
import { createStore, produce, reconcile } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { executeCommand } from '@/commands/registry'
import { DEFAULT_ANIMATION_DURATION_MS } from '@/components/SpotlightTour/tourTypes'
import { withRecordingSuppressed } from '@/recorder/recorder'
import { deepClone } from '@/utils/clone'
import type { CommandContext } from '@/commands/types'
import type { TourContext, TourGuide, TourStep, } from '@/components/SpotlightTour/tourTypes'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HistorySetter } from '@/utils/createStoreHistory'
import type { TimelineTrack } from '@/utils/timeline'

/**
 * Home — Phase 5. The driver behind the "Made here" portal: it replays a real
 * tour's steps against a flame of its own, so the section shows a flame being
 * built by the code that builds flames rather than by an animation of it.
 *
 * ## Why this is not MainWorkspace in a box
 *
 * The plan calls the portal a "live app-in-app". Mounting a second
 * `MainWorkspace` would be neither live nor isolated: that component owns
 * process-wide state that exists exactly once —
 *
 *  - `persistentSignal` keys in localStorage (sidebar layout, quick-picker
 *    mode, fly speed), which a second instance would write over the user's,
 *  - a `createStoreHistory(..., { journal: true })`, and the undo journal's
 *    `registerRedoClearer` is module-global: the portal editing its own flame
 *    would destroy the user's redo stack,
 *  - the autosave poll, which writes the flame into IndexedDB `recentFlames`
 *    every few minutes — the portal's scripted flame would show up in the
 *    user's recent files,
 *  - `useShortcutManager`, which binds document-level keys.
 *
 * None of that is fixable from the outside, and a portal that quietly poisons
 * undo or recents is worse than no portal.
 *
 * So the portal keeps the part that makes "live" mean something and drops the
 * part that cannot be duplicated. `executeCommand(id, ctx, ...args)` takes its
 * `CommandContext` as an ARGUMENT — the registry is global, the state it writes
 * is entirely the caller's. This module hands the tour's own `beforeShow` /
 * `onAnimate` callbacks a `TourContext` whose `executeCommand` runs the real
 * registered commands against a private store. The flame is built by the same
 * `flame.addTransform`, `flame.setAffine`, `flame.setVibrancy` the editor runs,
 * from the same step definitions, in the same order — and nothing outside this
 * driver can observe it. What the portal does NOT show is the editor's chrome:
 * there is no sidebar to spotlight, so the step's own text is the caption.
 *
 * Everything here is deliberately free of DOM and GPU so the whole script can
 * be run in a test (see portalScript.test.ts), which is the only practical way
 * to prove the isolation claim above.
 */

/**
 * Playback rate relative to the tour's own timings.
 *
 * The tours are paced for a person clicking Next and reading a paragraph: at
 * 1.0 the 24 steps of `example1-creation` run for about a minute. The portal is
 * ambient and loops, so it runs the same steps faster. Applied to BOTH the
 * per-step grace period and the duration every `animateValue` call asks for —
 * this module implements `animateValue`, so the tours need no portal-specific
 * timings of their own.
 */
export const PORTAL_TIME_SCALE = 0.55

/** Pause after a step's animation finishes, so its caption can be read. */
export const PORTAL_STEP_TAIL_MS = 420

/** Floor on a step, so a step that only sets values is still legible. */
export const PORTAL_MIN_STEP_MS = 900

/** How long the finished flame is held before the script restarts. */
export const PORTAL_HOLD_MS = 3500

/**
 * How long one step occupies the portal.
 *
 * The animation term assumes `DEFAULT_ANIMATION_DURATION_MS`, which is what
 * every tour step in this repo passes to `animateValue`. A step that asked for
 * longer would simply be snapped to its end value at the step boundary (see
 * `finishAllAnimations` below, which is what SpotlightTour does on a rapid
 * Next) — so the flame still ends up in the right state, just sooner.
 */
export function stepDurationMs(
  step: TourStep,
  timeScale: number = PORTAL_TIME_SCALE,
): number {
  const grace = (step.animationDelay ?? 0) * timeScale
  const animate =
    step.onAnimate === undefined ? 0 : DEFAULT_ANIMATION_DURATION_MS * timeScale
  return Math.max(PORTAL_MIN_STEP_MS, grace + animate + PORTAL_STEP_TAIL_MS)
}

/** One full loop, including the hold on the finished flame. */
export function scriptDurationMs(
  steps: readonly TourStep[],
  timeScale: number = PORTAL_TIME_SCALE,
): number {
  return (
    steps.reduce((total, step) => total + stepDurationMs(step, timeScale), 0) +
    PORTAL_HOLD_MS
  )
}

export interface PortalDriver {
  /** The isolated flame the script builds. A store, so Flam3 tracks it. */
  readonly flame: FlameDescriptor
  readonly zoom: () => number
  readonly position: () => ReturnType<typeof vec2f>
  /** Handed to the tour's own step callbacks. */
  readonly ctx: TourContext
  /** Snap every running animation to its end value. */
  readonly finishAllAnimations: () => void
  /** Back to the starting flame, for a replay or the next loop. */
  readonly reset: () => void
}

/**
 * Build the portal's private world: one flame store, one camera, one inert
 * everything-else, and the `TourContext` that writes to them.
 *
 * `start` is cloned, never held: the caller passes an example straight out of
 * the bundle and the driver must not mutate it.
 */
export function createPortalDriver(start: FlameDescriptor): PortalDriver {
  const [flame, setFlame] = createStore<FlameDescriptor>(deepClone(start))

  // The camera is a signal seeded from the descriptor, not read from it, which
  // is how MainWorkspace holds it too — `camera.center` and `camera.zoomTo` are
  // commands that move the VIEW, and a tour that calls them must not be
  // rewriting the saved flame.
  const startCamera = start.renderSettings.camera
  const [zoom, setZoom] = createSignal(startCamera.zoom)
  const [position, setPosition] = createSignal(vec2f(...startCamera.position))

  // Inert stand-ins for the editor state a tour may poke. They exist so the
  // context types are satisfied honestly — a tour step that opens the sidebar
  // or a modal changes a local boolean nobody renders, rather than reaching
  // into the app. Nothing here is wired to the real workspace on purpose.
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [timelineOpen, setTimelineOpen] = createSignal(false)
  const [animationEnabled, setAnimationEnabled] = createSignal(false)
  const [tracks, setTracks] = createSignal<TimelineTrack[]>([])
  const [duration, setDuration] = createSignal(0)
  const [currentFrame, setCurrentFrame] = createSignal(0)
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const [blendFlame, setBlendFlame] = createSignal<FlameDescriptor>()
  const [blendWeight, setBlendWeight] = createSignal(0)

  /**
   * The commands' only way to change the flame. The editor's `HistorySetter`
   * signature, without the history: a portal has no undo, and recording one is
   * what would have dragged in the app-wide undo journal this design exists to
   * stay out of. The `description` argument some commands pass is accepted and
   * ignored, exactly as it would be by a history nobody reads.
   *
   * Commands either mutate the draft (`flame.setProbability`) or return a whole
   * replacement (`flame.reset`, `flame.loadPreset`); both are handled so any
   * registered command is safe to script, not just the ones today's tours use.
   */
  const setFlameDescriptor: HistorySetter<FlameDescriptor> = (setFn) => {
    let replacement: FlameDescriptor | undefined
    setFlame(
      produce((draft: FlameDescriptor) => {
        const next = setFn(draft) as FlameDescriptor | undefined
        if (next !== undefined) {
          replacement = next
        }
      }),
    )
    if (replacement !== undefined) {
      setFlame(reconcile(deepClone(replacement)))
    }
  }

  const commandContext = {
     
    flameDescriptor: () => flame,
    setFlameDescriptor,
    blendFlame,
    setBlendFlame: (
      next: any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
    ) => {
      setBlendFlame(() => next)
    },
    blendWeight,
    setBlendWeight,
    pixelRatio,
    setPixelRatio,
    zoom,
    setZoom,
    position,
    setPosition,
    sidebar: { open: sidebarOpen, setOpen: setSidebarOpen },
    timeline: {
      tracks,
      setTracks,
      animationEnabled,
      setAnimationEnabled,
      duration,
      setDuration,
      currentFrame,
      setCurrentFrame,
      play: () => {},
      setLoop: () => {},
      setFps: () => {},
      addKeyframe: () => {},
    },
    camera: {
      center: () => {
        setZoom(1)
        setPosition(vec2f(0, 0))
      },
    },
    modal: { open: () => {} },
  }

  /** Running `animateValue` loops — each entry snaps to its end value. */
  const activeAnimations = new Set<() => void>()

  function finishAllAnimations(): void {
    for (const finish of [...activeAnimations]) {
      finish()
    }
    activeAnimations.clear()
  }

  const ctx: TourContext = {
    setSidebarOpen,
    sidebarOpen,
    setTimelineOpen,
    timelineOpen,
    setAnimationEnabled,
    animationEnabled,
    openModal: () => {},
    closeCurrentModal: () => {},
    // No editor is on screen, so there is nothing to scroll to. The step's
    // target selector would otherwise match the REAL workspace behind Home and
    // scroll the user's sidebar — the one way a step could reach outside.
    scrollToTarget: () => {},
    executeCommand: (id, ...args) => {
      // The portal loops its script ambiently; if a session recording is
      // active (module-global, so it survives leaving the workspace), the
      // portal's commands must not leak into the user's log.
      withRecordingSuppressed(() => {
        executeCommand(
          id,
          commandContext as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
          ...args,
        )
      })
    },
    animateValue: (start_, end, durationMs, onUpdate) => {
      const scaled = Math.max(0, durationMs * PORTAL_TIME_SCALE)
      let cancelled = false
      const startedAt = globalThis.performance.now()

      function finish() {
        if (!cancelled) {
          cancelled = true
          onUpdate(end)
        }
        activeAnimations.delete(finish)
      }

      function loop() {
        if (cancelled) {
          return
        }
        const elapsed = globalThis.performance.now() - startedAt
        if (elapsed >= scaled) {
          finish()
          return
        }
        // Ease-out cubic, matching the editor's own tour playback.
        const t = Math.min(1, elapsed / scaled)
        const eased = 1 - Math.pow(1 - t, 3)
        onUpdate(start_ + (end - start_) * eased)
        requestAnimationFrame(loop)
      }

      activeAnimations.add(finish)
      requestAnimationFrame(loop)
      return finish
    },
    finishAllAnimations,
    snapshotFlame: () => deepClone(flame),
    restoreFlame: (snapshot: unknown) => {
      setFlame(reconcile(deepClone(snapshot as FlameDescriptor)))
    },
  }

  return {
    get flame() {
      return flame
    },
    zoom,
    position,
    ctx,
    finishAllAnimations,
    reset: () => {
      finishAllAnimations()
      setFlame(reconcile(deepClone(start)))
      setZoom(startCamera.zoom)
      setPosition(vec2f(...startCamera.position))
    },
  }
}

/**
 * Run one step: its `beforeShow` immediately, its `onAnimate` after the (scaled)
 * grace period. Returns the handle for the pending `onAnimate`, so a cancelled
 * run cannot fire an animation into a torn-down driver.
 */
function playStep(
  step: TourStep,
  driver: PortalDriver,
  timeScale: number,
): ReturnType<typeof setTimeout> | undefined {
  // Snap whatever the previous step was still animating, exactly as
  // SpotlightTour does on a step transition: a value left mid-tween would make
  // the next step's `animateValue` start from somewhere the tour never intended.
  driver.finishAllAnimations()
  step.beforeShow?.(driver.ctx)
  if (step.onAnimate === undefined) {
    return undefined
  }
  const grace = (step.animationDelay ?? 0) * timeScale
  const onAnimate = step.onAnimate
  return setTimeout(() => {
    onAnimate(driver.ctx)
  }, grace)
}

export interface RunPortalScriptOptions {
  tour: TourGuide
  driver: PortalDriver
  /** Called as each step begins, with its index into `tour.steps`. -1 = idle. */
  onStep: (index: number) => void
  /** Called once the last step's time is up, before the hold. */
  onFinished?: () => void
  timeScale?: number
  /**
   * Pause on the finished flame for this long and then play the script again.
   * 0 stops on the finished flame instead of looping.
   */
  holdMs?: number
  /** Start advancing immediately. False leaves the run parked at step -1. */
  autoStart?: boolean
}

/**
 * A script in progress. Transport controls rather than a bare cancel function,
 * because the portal has three separate reasons to interfere with a run and
 * they must not be the same operation:
 *
 *  - it scrolls out of the play threshold, which STOPS it where it is
 *    (`pause`) — restarting on every small scroll is the thing the section was
 *    reported for,
 *  - it scrolls off screen entirely, which puts it back to the beginning
 *    (`restart`), and
 *  - the user drags the progress bar, which jumps the flame to a step
 *    (`seek`) — forward or back, since every step is replayed from the start
 *    flame rather than undone.
 */
export interface PortalScriptRun {
  /** Advance from wherever it is. No-op if already running or cancelled. */
  play: () => void
  /** Stop advancing. Every value the script has set stays set. */
  pause: () => void
  /** Back to "nothing applied". Keeps running if it was running. */
  restart: () => void
  /** Rebuild the flame as of `index` and continue from there. */
  seek: (index: number) => void
  /** Tear down: no timer will fire again. */
  cancel: () => void
  /** The step on screen; -1 before the first one. */
  stepIndex: () => number
  isRunning: () => boolean
}

/**
 * Play a tour's steps on the portal's own driver.
 *
 * Cancelling is the teardown path: the portal unmounts when it leaves the
 * page's near-window, and a script that kept its timers running would keep
 * writing into a store nothing renders. `pause` is the softer version, for a
 * portal that is still on screen but not enough of it to be worth playing.
 */
export function runPortalScript(
  options: RunPortalScriptOptions,
): PortalScriptRun {
  const { tour, driver, onStep, onFinished } = options
  const timeScale = options.timeScale ?? PORTAL_TIME_SCALE
  const holdMs = options.holdMs ?? PORTAL_HOLD_MS
  const lastIndex = tour.steps.length - 1
  let index = -1
  let stepTimer: ReturnType<typeof setTimeout> | undefined
  let animateTimer: ReturnType<typeof setTimeout> | undefined
  let cancelled = false
  let running = false

  function clearTimers() {
    clearTimeout(stepTimer)
    clearTimeout(animateTimer)
    stepTimer = undefined
    animateTimer = undefined
  }

  /** Wait out the current step, then move on. Also the resume path. */
  function scheduleNext() {
    const step = tour.steps[index]
    stepTimer = setTimeout(
      advance,
      step === undefined ? 0 : stepDurationMs(step, timeScale),
    )
  }

  function advance() {
    if (cancelled || !running) {
      return
    }
    const next = index + 1
    const step = tour.steps[next]
    if (step === undefined) {
      driver.finishAllAnimations()
      onFinished?.()
      if (holdMs <= 0) {
        running = false
        return
      }
      // Hold the finished flame — the one moment in the loop it is allowed to
      // converge — then start over.
      stepTimer = setTimeout(() => {
        index = -1
        driver.reset()
        advance()
      }, holdMs)
      return
    }
    index = next
    onStep(next)
    animateTimer = playStep(step, driver, timeScale)
    scheduleNext()
  }

  const run: PortalScriptRun = {
    play() {
      if (cancelled || running) {
        return
      }
      running = true
      if (index < 0) {
        advance()
      } else {
        scheduleNext()
      }
    },
    pause() {
      if (!running) {
        return
      }
      running = false
      clearTimers()
      // Land the in-flight tween on its end value, so the held frame is a state
      // the tour actually describes rather than a moment inside an ease curve.
      driver.finishAllAnimations()
    },
    restart() {
      clearTimers()
      driver.reset()
      index = -1
      if (running) {
        advance()
      } else {
        onStep(-1)
      }
    },
    seek(target) {
      if (cancelled) {
        return
      }
      clearTimers()
      const clamped = Math.min(lastIndex, Math.max(0, Math.floor(target)))
      // Rebuilt from the start flame rather than stepped backwards: the tour's
      // steps are writes, not reversible edits, so replaying a prefix is the
      // only way a backward seek can land on the state that prefix describes.
      driver.reset()
      applyStepsUpTo(tour, driver, clamped)
      index = clamped
      onStep(clamped)
      if (running) {
        scheduleNext()
      }
    },
    cancel() {
      cancelled = true
      running = false
      clearTimers()
      driver.finishAllAnimations()
    },
    stepIndex: () => index,
    isRunning: () => running,
  }

  if (options.autoStart !== false) {
    run.play()
  }
  return run
}

/**
 * Apply steps `0..lastIndex` at once, with no waiting and no animation.
 *
 * Two callers, one mechanism: `prefers-reduced-motion: reduce` gets the whole
 * script this way (the finished flame, static, captioned by the last step), and
 * a scrubbed seek gets the prefix. Each step still runs through the real
 * commands — the result is the same flame the animated run arrives at, not a
 * stored picture of it.
 */
export function applyStepsUpTo(
  tour: TourGuide,
  driver: PortalDriver,
  lastIndex: number,
): void {
  for (const step of tour.steps.slice(0, Math.max(0, lastIndex + 1))) {
    step.beforeShow?.(driver.ctx)
    step.onAnimate?.(driver.ctx)
    // Snap immediately: `animateValue` returns its finisher, but the tours call
    // it without keeping one, so this is what lands every tween on its end.
    driver.finishAllAnimations()
  }
}

/** Every step, instantly. See {@link applyStepsUpTo}. */
export function applyWholeScript(tour: TourGuide, driver: PortalDriver): void {
  applyStepsUpTo(tour, driver, tour.steps.length - 1)
}
