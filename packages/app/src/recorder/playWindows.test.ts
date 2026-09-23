import { describe, expect, it } from 'vitest'
import { planPlayWindows, stepPlayhead } from './playWindows'
import type { PlayWindow } from './playWindows'
import type { RecordedAction } from './schema'

/**
 * Where a take's play windows open and close, and how a playing playhead
 * wraps: the structure both the in-app player and the artwork export pace.
 */

const play = (t: number, frame: number): RecordedAction => ({
  t,
  id: 'timeline.setPlaying',
  args: [true, frame],
})
const pause = (t: number, frame: number, advanced?: number) => ({
  t,
  id: 'timeline.setPlaying',
  args: advanced === undefined ? [false, frame] : [false, frame, advanced],
})
const stillPlaying = (t: number, frame: number, advanced: number) => ({
  t,
  id: 'timeline.setPlaying',
  args: [true, frame, advanced],
})
const seek = (t: number, frame: number): RecordedAction => ({
  t,
  id: 'timeline.setCurrentFrame',
  args: [frame],
})
const edit = (t: number): RecordedAction => ({
  t,
  id: 'flame.setGamma',
  args: [2],
})

function window(over: Partial<PlayWindow>): PlayWindow {
  return {
    startIndex: 0,
    endIndex: 1,
    startT: 1000,
    endT: 3000,
    startFrame: 0,
    endFrame: undefined,
    advanced: undefined,
    loopChanged: false,
    ...over,
  }
}

describe('planPlayWindows', () => {
  it('opens a window on Play and closes it on the Pause, with its count', () => {
    const plan = planPlayWindows([edit(0), play(1000, 5), pause(3000, 55, 50)])
    expect(plan.windows).toEqual([
      window({
        startIndex: 1,
        endIndex: 2,
        startFrame: 5,
        endFrame: 55,
        advanced: 50,
      }),
    ])
    expect(plan.after.map((w) => w !== undefined)).toEqual([false, true, false])
  })

  it('keeps an edit made while playing inside the window', () => {
    const plan = planPlayWindows([play(0, 0), edit(500), pause(1000, 25, 25)])
    expect(plan.windows).toHaveLength(1)
    expect(plan.after.map((w) => w !== undefined)).toEqual([true, true, false])
  })

  it('ends a window at a seek made while playing and starts the next there', () => {
    const plan = planPlayWindows([
      play(0, 0),
      seek(1000, 300),
      pause(3000, 350, 50),
    ])
    expect(plan.windows).toEqual([
      window({
        startIndex: 0,
        endIndex: 1,
        startT: 0,
        endT: 1000,
        startFrame: 0,
      }),
      window({
        startIndex: 1,
        endIndex: 2,
        startT: 1000,
        endT: 3000,
        startFrame: 300,
        endFrame: 350,
        advanced: 50,
      }),
    ])
  })

  it('treats a seek made while paused as no window at all', () => {
    const plan = planPlayWindows([
      seek(0, 30),
      play(1000, 30),
      pause(2000, 55, 25),
    ])
    expect(plan.windows).toHaveLength(1)
    expect(plan.after.map((w) => w !== undefined)).toEqual([false, true, false])
  })

  it('marks a window whose loop a step changed', () => {
    const loop = { t: 500, id: 'timeline.setLoop', args: [false] }
    const plan = planPlayWindows([
      play(0, 0),
      edit(250),
      loop,
      pause(1000, 25, 25),
    ])
    expect(plan.windows[0]?.loopChanged).toBe(true)
    expect(
      planPlayWindows([play(0, 0), edit(250)]).windows[0]?.loopChanged,
    ).toBe(false)
  })

  it('reads a snapshot load that carries a playhead as a seek', () => {
    const load: RecordedAction = {
      t: 500,
      id: 'timeline.loadTimeline',
      args: [{ currentFrame: 40, tracks: [] }],
    }
    const plan = planPlayWindows([play(0, 0), load, pause(1000, 52, 12)])
    expect(plan.windows.map((w) => w.startFrame)).toEqual([0, 40])
  })

  it('does not pin the end of a window on a Play that jumped', () => {
    // A non-looping Play on the last frame starts over: the frame it names is
    // where it went, not where the playback got.
    const plan = planPlayWindows([
      play(0, 0),
      play(1000, 0),
      pause(2000, 25, 25),
    ])
    expect(plan.windows[0]).toMatchObject({ endT: 1000, endFrame: undefined })
    expect(plan.windows[1]).toMatchObject({ startT: 1000, endFrame: 25 })
  })

  it('leaves the last window open when the take ended still playing', () => {
    const plan = planPlayWindows([play(0, 0), edit(1000)])
    expect(plan.windows[0]).toMatchObject({
      endIndex: undefined,
      endT: undefined,
    })
    expect(plan.after.map((w) => w !== undefined)).toEqual([true, true])
  })

  it('pins the frame a take stopped on while still playing, and plays on', () => {
    const plan = planPlayWindows([play(0, 0), stillPlaying(2000, 50, 50)])
    expect(plan.windows[0]).toMatchObject({
      endT: 2000,
      endFrame: 50,
      advanced: 50,
    })
    expect(plan.windows[1]).toMatchObject({ startT: 2000, endT: undefined })
  })

  it('reads the two-argument Pause of a take recorded before the count', () => {
    const plan = planPlayWindows([play(11_002, 22), pause(13_163, 58)])
    expect(plan.windows[0]).toMatchObject({ endFrame: 58, advanced: undefined })
  })

  it('ignores a Pause with no window open', () => {
    expect(planPlayWindows([pause(0, 10, 3)]).windows).toEqual([])
  })
})

describe('stepPlayhead', () => {
  const loop = { startFrame: 10, endFrame: 19, loop: true }

  it('moves within the loop', () => {
    expect(stepPlayhead(12, 0, loop)).toEqual({ frame: 12, stopped: false })
    expect(stepPlayhead(12, 7, loop)).toEqual({ frame: 19, stopped: false })
  })

  it('wraps to the start past the end, as often as the count goes round', () => {
    expect(stepPlayhead(12, 8, loop)).toEqual({ frame: 10, stopped: false })
    // 7 to the end, 1 to wrap, then two whole loops of 10 and 3 more.
    expect(stepPlayhead(12, 31, loop)).toEqual({ frame: 13, stopped: false })
  })

  it('stops on the first frame without a loop', () => {
    const once = { ...loop, loop: false }
    expect(stepPlayhead(12, 8, once)).toEqual({ frame: 10, stopped: true })
    expect(stepPlayhead(12, 30, once)).toEqual({ frame: 10, stopped: true })
  })

  it('wraps at once from a playhead past a shortened end', () => {
    expect(stepPlayhead(25, 1, loop)).toEqual({ frame: 10, stopped: false })
  })
})
