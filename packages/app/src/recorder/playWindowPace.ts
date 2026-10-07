/**
 * The pace a replay plays a take's play windows at (recorder/playWindows.ts).
 *
 * The live pace is not the nominal fps: with Auto FPS a frame advances only
 * once it reaches target quality, and a busy main thread slows the interval,
 * so the count a stop records is what the take actually did. Where it is
 * missing (a seek ended the window, or the take predates the count), the pace
 * is the take's own measured rate, else the nominal fps, and a known end frame
 * fixes how many loops the estimate may wrap.
 */

import { planPlayWindows, stepPlayhead } from './playWindows'
import type { PlaybackClock, PlaybackLoop, PlayWindow } from './playWindows'
import type { RecordedAction } from './schema'

/** Frames per take millisecond at the configured fps. `timeScale` is how
 *  many frames the render loop advances per tick, rounded up as it does. */
export function nominalFramesPerMs(clock: PlaybackClock): number {
  const perTick = clock.timeScale > 0 ? Math.ceil(clock.timeScale) : 0
  return (clock.fps * perTick) / 1000
}

/** The rate the take itself played at, over every window that says. */
export function measuredFramesPerMs(
  windows: readonly PlayWindow[],
): number | undefined {
  let frames = 0
  let ms = 0
  for (const window of windows) {
    if (window.advanced === undefined || window.endT === undefined) continue
    if (window.endT <= window.startT) continue
    frames += window.advanced
    ms += window.endT - window.startT
  }
  return ms > 0 ? frames / ms : undefined
}

/** The fewest advances that put a playhead from `start` on `end`. */
function advancesTo(start: number, end: number, loop: PlaybackLoop) {
  const within = Math.max(0, loop.endFrame - start)
  if (end >= start && end - start <= within) return end - start
  const inLoop = end >= loop.startFrame && end <= loop.endFrame
  if (!loop.loop) return end === loop.startFrame ? within + 1 : undefined
  return inLoop ? within + 1 + (end - loop.startFrame) : undefined
}

export type WindowPace = {
  window: PlayWindow
  startFrame: number
  /** Frames per take millisecond. */
  rate: number
  /** Frames the whole window advances; undefined when it never ends. */
  total: number | undefined
  /** No more than this, so an estimate never runs a playback off its end. */
  cap: number
}

/**
 * How window `window` plays, given the frame its opening step left the
 * playhead on and the timeline as it stands then.
 *
 * A recorded count wins when it agrees with the recorded end frame, or when
 * the loop changed inside the window so the two cannot be compared (the
 * count survives a loop edit; only a playhead move outside a command resets
 * it, and that take is already marked as not replaying exactly). A known
 * end frame without one fixes the frames up to it, and the duration picks how
 * many whole loops the playback wrapped on the way. Otherwise the duration at
 * the estimated rate says it all.
 */
export function paceWindow(
  window: PlayWindow,
  startFrame: number,
  clock: PlaybackClock,
  measuredRate?: number,
): WindowPace {
  const estimate = measuredRate ?? nominalFramesPerMs(clock)
  const duration =
    window.endT === undefined ? undefined : window.endT - window.startT
  const noLoopCap = clock.loop
    ? Number.POSITIVE_INFINITY
    : Math.max(0, clock.endFrame - startFrame)
  let total: number | undefined
  let cap = noLoopCap
  const { advanced, endFrame } = window
  if (
    advanced !== undefined &&
    (endFrame === undefined ||
      window.loopChanged ||
      stepPlayhead(startFrame, advanced, clock).frame === endFrame)
  ) {
    total = advanced
    cap = advanced
  } else if (endFrame !== undefined) {
    const base = advancesTo(startFrame, endFrame, clock)
    if (base !== undefined) {
      const cycle = clock.endFrame - clock.startFrame + 1
      const loops =
        clock.loop && duration !== undefined
          ? Math.max(0, Math.round((duration * estimate - base) / cycle))
          : 0
      total = base + loops * cycle
      cap = total
    }
  } else if (duration !== undefined) {
    total = Math.min(noLoopCap, Math.round(duration * estimate))
  }
  const rate =
    total !== undefined && duration !== undefined && duration > 0
      ? total / duration
      : estimate
  return { window, startFrame, rate, total, cap }
}

/** Frames advanced by take time `t`: linear across the window, whole frames,
 *  and exactly the window's total at its end. */
export function advanceAt(pace: WindowPace, t: number): number {
  const { startT, endT } = pace.window
  if (pace.total !== undefined && endT !== undefined && t >= endT) {
    return pace.total
  }
  if (t <= startT) return 0
  return Math.min(pace.cap, Math.floor((t - startT) * pace.rate + 1e-9))
}

/**
 * The playhead a replay shows, walked forward through a take.
 *
 * Both consumers drive it the same way: before a step runs, `frameAt` its
 * take time puts the playhead where the take had it; after the step runs,
 * `afterStep` opens, continues or closes the window the next gap is in. It
 * advances by counting frames through `stepPlayhead` with the loop as it
 * stands at each move, which is what the live render loop does, so an edit
 * to the loop inside a window wraps where the take wrapped.
 */
export type PlayheadPacer = {
  afterStep: (index: number, playhead: number, clock: PlaybackClock) => void
  /** Where the playhead belongs at take time `t`; undefined outside a window. */
  frameAt: (t: number, loop: PlaybackLoop) => number | undefined
  /** The window the playhead is in now, if the take was playing. */
  current: () => PlayWindow | undefined
  reset: () => void
}

export function createPlayheadPacer(
  actions: readonly RecordedAction[],
): PlayheadPacer {
  const plan = planPlayWindows(actions)
  const measured = measuredFramesPerMs(plan.windows)
  let pace: WindowPace | undefined
  let count = 0
  let frame = 0
  return {
    afterStep(index, playhead, clock) {
      const window = plan.after[index]
      if (window === pace?.window) return
      pace =
        window === undefined
          ? undefined
          : paceWindow(window, playhead, clock, measured)
      count = 0
      frame = playhead
    },
    frameAt(t, loop) {
      if (!pace) return undefined
      const target = advanceAt(pace, t)
      if (target > count) {
        frame = stepPlayhead(frame, target - count, loop).frame
        count = target
      }
      return frame
    },
    current: () => pace?.window,
    reset() {
      pace = undefined
      count = 0
    },
  }
}
