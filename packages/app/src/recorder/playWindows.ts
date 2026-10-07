/**
 * Play windows: the stretches of a take in which its timeline was playing.
 *
 * A window opens on a Play step and runs until whatever next stops or moves
 * the playhead: the Pause, a seek, another Play, or the end of the take. A
 * stop records the frames the playback advanced (`setPlaying(false, frame,
 * advanced)`, or `setPlaying(true, ...)` for a take stopped while playing),
 * and both replays pace a window the same way (recorder/playWindowPace.ts).
 */

import { isAdvanceCount, TIMELINE_PLAYBACK_COMMAND_ID } from './transportStep'
import type { RecordedAction } from './schema'

/** The part of the timeline config a playing playhead wraps by. */
export type PlaybackLoop = {
  startFrame: number
  endFrame: number
  loop: boolean
}

/** What a replay knows about the timeline when a window opens. */
export type PlaybackClock = PlaybackLoop & { fps: number; timeScale: number }

export type PlayWindow = {
  /** The step that opened it: a Play, or a seek made while playing. */
  startIndex: number
  /** The step that ended it; undefined when the take ends still playing. */
  endIndex: number | undefined
  startT: number
  endT: number | undefined
  /** The frame the opening step put the playhead on. */
  startFrame: number
  /** The frame the take recorded at the end, when a step pinned one. */
  endFrame: number | undefined
  /** Frames the playback advanced across the window, when the take says. */
  advanced: number | undefined
  /** A step inside it changed the loop range, so the end frame alone no
   *  longer says where the count should have landed. */
  loopChanged: boolean
}

export type PlayWindowPlan = {
  windows: PlayWindow[]
  /** The window the gap after each step belongs to, if the take played. */
  after: (PlayWindow | undefined)[]
}

type PlaybackStep = { playing: boolean; frame: number; advanced?: number }

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** A `timeline.setPlaying` step's arguments, in the two- or three-part form. */
export function readPlaybackStep(
  action: RecordedAction,
): PlaybackStep | undefined {
  if (action.id !== TIMELINE_PLAYBACK_COMMAND_ID) return undefined
  const [playing, frame, advanced] = action.args
  if (typeof playing !== 'boolean' || !isCount(frame)) return undefined
  return isAdvanceCount(advanced)
    ? { playing, frame, advanced }
    : { playing, frame }
}

/** Steps that move the loop a playing timeline wraps by, and not its
 *  playhead. They leave the live count running (utils/timeline.ts). */
const LOOP_EDITS = new Set([
  'timeline.setDuration',
  'timeline.setLoop',
  'timeline.loadTimeline',
])

/** Where a step that is not Play or Pause puts the playhead, if it moves it. */
function seekFrame(action: RecordedAction): number | undefined {
  if (action.id === 'timeline.setCurrentFrame') {
    return isCount(action.args[0]) ? action.args[0] : undefined
  }
  if (action.id !== 'timeline.loadTimeline') return undefined
  const snapshot = action.args[0] as { currentFrame?: unknown } | undefined
  return isCount(snapshot?.currentFrame) ? snapshot.currentFrame : undefined
}

export function planPlayWindows(
  actions: readonly RecordedAction[],
): PlayWindowPlan {
  const windows: PlayWindow[] = []
  const after: (PlayWindow | undefined)[] = []
  let open: PlayWindow | undefined
  const openAt = (index: number, frame: number): PlayWindow => {
    const window: PlayWindow = {
      startIndex: index,
      endIndex: undefined,
      startT: actions[index]!.t,
      endT: undefined,
      startFrame: frame,
      endFrame: undefined,
      advanced: undefined,
      loopChanged: false,
    }
    windows.push(window)
    return window
  }
  const close = (index: number, pinned?: PlaybackStep) => {
    if (!open) return
    open.endIndex = index
    open.endT = actions[index]!.t
    // A Play made while playing jumps; only a pinned stop names the frame
    // the playback reached.
    if (pinned && (!pinned.playing || pinned.advanced !== undefined)) {
      open.endFrame = pinned.frame
      open.advanced = pinned.advanced
    }
  }
  actions.forEach((action, index) => {
    const step = readPlaybackStep(action)
    const seek = step ? undefined : seekFrame(action)
    if (step) {
      close(index, step)
      open = step.playing ? openAt(index, step.frame) : undefined
    } else if (seek !== undefined && open) {
      close(index)
      open = openAt(index, seek)
    } else if (open && LOOP_EDITS.has(action.id)) {
      open.loopChanged = true
    }
    after.push(open)
  })
  return { windows, after }
}

/**
 * Where `count` advances of a playing timeline leave a playhead that stands
 * on `frame`: `advanceFrame`'s rule in utils/timeline.ts, counted rather than
 * stepped. Past the end it wraps to the start, or stops there without a loop.
 */
export function stepPlayhead(
  frame: number,
  count: number,
  loop: PlaybackLoop,
): { frame: number; stopped: boolean } {
  if (count <= 0) return { frame, stopped: false }
  const within = Math.max(0, loop.endFrame - frame)
  if (count <= within) return { frame: frame + count, stopped: false }
  if (!loop.loop) return { frame: loop.startFrame, stopped: true }
  const cycle = Math.max(1, loop.endFrame - loop.startFrame + 1)
  return {
    frame: loop.startFrame + ((count - within - 1) % cycle),
    stopped: false,
  }
}
