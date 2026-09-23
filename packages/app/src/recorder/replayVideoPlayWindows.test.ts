import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createReplayVideoDriver, createReplayVideoSchedule, replayStateAtFrame, } from './replayVideo'
import { SESSION_FORMAT_VERSION } from './schema'
import type { ReplayVideoFrameState, ReplayVideoSchedule } from './replayVideo'
import type { RecordedAction, RecordedSession } from './schema'

/**
 * The artwork video plays the animation a take played: inside a play window
 * each output frame shows the take's own moment, so the playhead advances
 * frame by frame at the take's pace and the Pause lands on the recorded frame
 * (recorder/playWindows.ts, the pace the in-app replay uses too).
 */

const FPS = 24

function animatedSession(actions: RecordedAction[]): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    initialTimeline: {
      config: {
        fps: 25,
        timeScale: 1,
        startFrame: 0,
        endFrame: 150,
        loop: true,
      },
      currentFrame: 0,
      animationEnabled: true,
      autoKeyframe: false,
      previewHeld: true,
      tracks: [],
    },
    actions: [
      { t: 0, id: 'timeline.addKeyframe', args: ['gamma', 1, 0, null, null] },
      { t: 0, id: 'timeline.addKeyframe', args: ['gamma', 4, 150, null, null] },
      ...actions,
    ],
    unnamedWriteCount: 0,
  }
}

/** Play at 1 s, an edit made while playing at 4 s, Pause at 7 s on 150. */
const take = animatedSession([
  { t: 1000, id: 'timeline.setPlaying', args: [true, 0] },
  { t: 4000, id: 'flame.setContrast', args: [1.2] },
  { t: 7000, id: 'timeline.setPlaying', args: [false, 150, 150] },
])
const PLAY = 2
const EDIT = 3
const PAUSE = 4

/** Every output frame from `from` up to (not including) `to`, as the job
 *  runner renders them. */
function render(
  session: RecordedSession,
  schedule: ReplayVideoSchedule,
  from: number,
  to: number,
): ReplayVideoFrameState[] {
  const driver = createReplayVideoDriver(session)
  const frames: ReplayVideoFrameState[] = []
  for (let frame = from; frame < to; frame++) {
    const at = replayStateAtFrame(schedule, frame)
    frames.push(driver.advanceTo(at.actionIndex, at.glideT, at.takeMs))
  }
  return frames
}

const oneFrameMs = 1000 / FPS

describe('replay video play windows', () => {
  it('gives a play window its real duration, and an edit inside it its recorded time', () => {
    const schedule = createReplayVideoSchedule(take, 1, FPS, 0, 0)
    const at = schedule.actionTimesMs
    expect(Math.abs(at[EDIT]! - at[PLAY]! - 3000)).toBeLessThanOrEqual(
      oneFrameMs,
    )
    expect(Math.abs(at[PAUSE]! - at[EDIT]! - 3000)).toBeLessThanOrEqual(
      oneFrameMs,
    )
    // Twice the speed halves the window, as it halves every other gap.
    const fast = createReplayVideoSchedule(take, 2, FPS, 0, 0).actionTimesMs
    expect(Math.abs(fast[PAUSE]! - fast[PLAY]! - 3000)).toBeLessThanOrEqual(
      oneFrameMs,
    )
  })

  it('moves the playhead frame by frame through the window onto the Pause frame', () => {
    const schedule = createReplayVideoSchedule(take, 1, FPS, 0, 0)
    const start = schedule.actionFrames[PLAY]!
    const pause = schedule.actionFrames[PAUSE]!
    const frames = render(take, schedule, start, pause + 1)
    const playheads = frames.map((frame) => frame.playhead)
    expect(playheads[0]).toBe(0)
    for (let index = 1; index < playheads.length; index++) {
      expect(playheads[index]!).toBeGreaterThanOrEqual(playheads[index - 1]!)
    }
    // Six seconds at 24 fps: 144 frames, nearly every one a new playhead.
    expect(new Set(playheads).size).toBeGreaterThan(140)
    expect(playheads.at(-2)!).toBeGreaterThanOrEqual(148)
    expect(playheads.at(-1)).toBe(150)
    // The flame is posed at the moving frame, not held at the first one.
    const gammas = frames.map((frame) => frame.flame.renderSettings.gamma)
    expect(gammas[0]).toBe(1)
    expect(gammas.at(-1)).toBe(4)
    expect(new Set(gammas).size).toBeGreaterThan(140)
  })

  it('applies the edit at the frame the take made it on', () => {
    const schedule = createReplayVideoSchedule(take, 1, FPS, 0, 0)
    const edit = schedule.actionFrames[EDIT]!
    const [before, on] = render(take, schedule, edit - 1, edit + 1)
    expect(before!.flame.renderSettings.contrast).not.toBe(1.2)
    expect(on!.flame.renderSettings.contrast).toBe(1.2)
    // Three seconds into a 150-frame, six-second window.
    expect(on!.playhead).toBe(75)
  })

  it('renders the same frame for the same moment, in any order', () => {
    const schedule = createReplayVideoSchedule(take, 1, FPS, 0, 0)
    const driver = createReplayVideoDriver(take)
    const late = replayStateAtFrame(schedule, schedule.actionFrames[EDIT]! + 30)
    const early = replayStateAtFrame(schedule, schedule.actionFrames[EDIT]! + 5)
    const first = driver.advanceTo(late.actionIndex, late.glideT, late.takeMs)
    const back = driver.advanceTo(early.actionIndex, early.glideT, early.takeMs)
    const fresh = createReplayVideoDriver(take)
    const again = fresh.advanceTo(early.actionIndex, early.glideT, early.takeMs)
    expect(back.playhead).toBe(again.playhead)
    expect(back.playhead!).toBeLessThan(first.playhead!)
  })

  it('keeps a take that ended still playing moving through the tail', () => {
    const open = animatedSession([
      { t: 1000, id: 'timeline.setPlaying', args: [true, 0] },
      { t: 2000, id: 'flame.setContrast', args: [1.2] },
    ])
    const schedule = createReplayVideoSchedule(open, 1, FPS, 0, 1400)
    const last = schedule.actionFrames.at(-1)!
    const tail = render(open, schedule, last, schedule.totalFrames)
    expect(tail[0]!.playhead).toBe(25)
    expect(tail.at(-1)!.playhead!).toBeGreaterThan(55)
  })

  it('leaves a paused take exactly as it was', () => {
    const still = animatedSession([
      { t: 1000, id: 'flame.setContrast', args: [1.2] },
      { t: 9000, id: 'flame.setContrast', args: [1.4] },
    ])
    const schedule = createReplayVideoSchedule(still, 1, FPS, 0, 0)
    // A paused gap is paced to be watchable, not replayed at its length.
    expect(
      schedule.actionTimesMs[3]! - schedule.actionTimesMs[2]!,
    ).toBeLessThan(2100)
    expect(schedule.playing.every((playing) => !playing)).toBe(true)
    const frames = render(still, schedule, 0, schedule.totalFrames)
    expect(new Set(frames.map((frame) => frame.playhead))).toEqual(new Set([0]))
  })

  it('refuses a window longer than the video limit, and fits it at a faster speed', () => {
    const long = animatedSession([
      { t: 1000, id: 'timeline.setPlaying', args: [true, 0] },
      { t: 311_000, id: 'timeline.setPlaying', args: [false, 49, 7750] },
    ])
    expect(() => createReplayVideoSchedule(long, 1)).toThrow(/limit is 300s/)
    expect(createReplayVideoSchedule(long, 2).durationMs).toBeLessThan(160_000)
  })
})
