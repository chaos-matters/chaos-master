/**
 * The replay player's half of a play window (recorder/playWindows.ts): across
 * a gap the take spent playing, wait the take's own time, run a take clock
 * (wall time times the replay speed) and hold the playhead on every frame
 * where the shared pace puts it. A target without a playback only waits.
 */

import { createPlayheadPacer } from './playWindowPace'
import { planPlayWindows } from './playWindows'
import type { ReplayPlayback } from './replay'
import type { RecordedAction } from './schema'

export type PlayerPlayWindows = {
  /** Whether the gap after the last step run is one the take spent playing. */
  inWindow: () => boolean
  /** Hold the playhead where the take had it at take time `t`. */
  holdAt: (t: number, playing: boolean) => void
  /** Step `index` ran: follow the window the gap after it is in. */
  afterStep: (index: number) => void
  /** Take time now, while the clock runs. */
  now: () => number | undefined
  /** Run the clock from take time `t` to `until`; the wall time that takes. */
  startClock: (t: number, until: number) => number
  stopClock: () => void
  /** Every take starts paused: forget the windows walked so far. */
  reset: () => void
  /** Hand the playhead back to the timeline's own clock; `pause` first stops
   *  a playback the replay holds, on the frame it has. */
  release: (pause?: boolean) => void
}

type TakeClock = { t: number; wall: number; speed: number; until: number }

export function createPlayerPlayWindows(
  actions: readonly RecordedAction[],
  playback: ReplayPlayback | undefined,
  replay: {
    isPlaying: () => boolean
    speed: () => number
    /** The speed changed inside a window: wait this long for the next step. */
    respeed: (waitMs: number) => void
  },
): PlayerPlayWindows {
  const after = planPlayWindows(actions).after
  const pacer = createPlayheadPacer(actions)
  let last = -1
  /** Whether the replay holds the playhead playing. */
  let playing = false
  let clock: TakeClock | undefined
  let cancelFrame: (() => void) | undefined
  const wallNow = () => globalThis.performance.now()

  function holdAt(t: number, on: boolean): void {
    if (!playback || !pacer.current()) return
    const frame = pacer.frameAt(t, playback.read())
    if (frame !== undefined) hold(frame, on)
  }

  function hold(frame: number, on: boolean): void {
    playback?.hold(frame, on)
    playing = on
  }

  function now(): number | undefined {
    if (!clock) return undefined
    const ran = (wallNow() - clock.wall) * clock.speed
    return Math.min(clock.until, clock.t + ran)
  }

  function requestTick(): void {
    if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(tick)
      cancelFrame = () => {
        cancelAnimationFrame(id)
      }
    } else {
      const id = setTimeout(tick, 16)
      cancelFrame = () => {
        clearTimeout(id)
      }
    }
  }

  /** One frame of a window: the playhead at the take time it is. */
  function tick(): void {
    cancelFrame = undefined
    const t = now()
    if (t === undefined || !clock || !replay.isPlaying()) return
    // A new speed lands now, not after the window: re-anchor the clock and
    // re-time the step it waits for.
    const speed = replay.speed()
    if (speed !== clock.speed) {
      clock = { ...clock, t, wall: wallNow(), speed }
      replay.respeed((clock.until - t) / speed)
    }
    holdAt(t, true)
    requestTick()
  }

  function release(pause = false): void {
    if (!playback) return
    if (pause && playing) hold(playback.read().frame, false)
    playing = false
    playback.release()
  }

  function stopClock(): void {
    cancelFrame?.()
    cancelFrame = undefined
    clock = undefined
  }

  return {
    inWindow: () => after[last] !== undefined,
    holdAt,
    afterStep(index) {
      last = index
      if (!playback) return
      const state = playback.read()
      pacer.afterStep(index, state.frame, state)
      if (pacer.current()) hold(state.frame, true)
      else release()
    },
    now,
    startClock(t, until) {
      stopClock()
      clock = { t, wall: wallNow(), speed: replay.speed(), until }
      requestTick()
      return (until - t) / clock.speed
    },
    stopClock,
    reset() {
      last = -1
      pacer.reset()
    },
    release,
  }
}
