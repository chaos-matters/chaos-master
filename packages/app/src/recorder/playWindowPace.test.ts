import { describe, expect, it } from 'vitest'
import { advanceAt, createPlayheadPacer, measuredFramesPerMs, nominalFramesPerMs, paceWindow, } from './playWindowPace'
import { stepPlayhead } from './playWindows'
import type { PlaybackClock, PlayWindow } from './playWindows'
import type { RecordedAction } from './schema'

/**
 * The pace a replay plays a take's play windows at, as pure functions: the
 * in-app player and the artwork export both read their playhead from these,
 * so each case the take can present is pinned here once.
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

const clock = (over: Partial<PlaybackClock> = {}): PlaybackClock => ({
  startFrame: 0,
  endFrame: 99,
  loop: true,
  fps: 25,
  timeScale: 1,
  ...over,
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

describe('the estimated rates', () => {
  it('reads the configured fps, and the frames each tick advances', () => {
    expect(nominalFramesPerMs(clock())).toBe(0.025)
    expect(nominalFramesPerMs(clock({ timeScale: 2 }))).toBe(0.05)
    // The render loop runs `for (i = 0; i < timeScale; i++)`.
    expect(nominalFramesPerMs(clock({ timeScale: 0.5 }))).toBe(0.025)
    expect(nominalFramesPerMs(clock({ timeScale: 0 }))).toBe(0)
  })

  it('measures the take over the windows that say how far they got', () => {
    const windows = [
      window({ startT: 0, endT: 2000, advanced: 20 }),
      window({ startT: 3000, endT: 5000, advanced: 40 }),
      window({ startT: 6000, endT: 7000 }),
    ]
    expect(measuredFramesPerMs(windows)).toBe(0.015)
    expect(measuredFramesPerMs([window({})])).toBeUndefined()
  })
})

describe('paceWindow and advanceAt', () => {
  it('plays a recorded count evenly across the window', () => {
    const pace = paceWindow(window({ endFrame: 30, advanced: 30 }), 0, clock())
    expect(pace).toMatchObject({ rate: 0.015, total: 30 })
    expect(advanceAt(pace, 1000)).toBe(0)
    expect(advanceAt(pace, 2000)).toBe(15)
    expect(advanceAt(pace, 2999)).toBe(29)
    expect(advanceAt(pace, 3000)).toBe(30)
    expect(advanceAt(pace, 9000)).toBe(30)
  })

  it('follows the count through loops the end frame alone cannot show', () => {
    // 250 frames in a 100-frame loop from 0 lands on 50: twice round.
    const pace = paceWindow(window({ endFrame: 50, advanced: 250 }), 0, clock())
    expect(pace.total).toBe(250)
    expect(stepPlayhead(0, advanceAt(pace, 3000), clock()).frame).toBe(50)
  })

  it('estimates the loops from the duration for a take without the count', () => {
    // 2161 ms at a nominal 30 fps is 65 frames; 22 to 58 is 36, and one more
    // loop of 91 would be 127, so the playback did not wrap.
    const short = window({
      startT: 11_002,
      endT: 13_163,
      startFrame: 22,
      endFrame: 58,
    })
    const loop91 = clock({ fps: 30, endFrame: 90 })
    expect(paceWindow(short, 22, loop91).total).toBe(36)
    // Ten seconds is 300 frames: 36 plus three loops is 309, the nearest.
    const long = { ...short, endT: 21_002 }
    expect(paceWindow(long, 22, loop91).total).toBe(36 + 3 * 91)
  })

  it("prefers the take's measured rate over the nominal fps when estimating", () => {
    const long = window({
      startT: 0,
      endT: 10_000,
      startFrame: 0,
      endFrame: 10,
    })
    // At 25 fps the nearest is 10 + 2 loops; at the take's 3 fps, no loop.
    expect(paceWindow(long, 0, clock()).total).toBe(210)
    expect(paceWindow(long, 0, clock(), 0.003).total).toBe(10)
  })

  it('distrusts a count that does not reach the recorded frame', () => {
    // An unrecorded seek reset the live count: the end frame still wins.
    const pace = paceWindow(window({ endFrame: 60, advanced: 12 }), 0, clock())
    expect(pace.total).toBe(60)
  })

  it('trusts the count over a loop that changed inside the window', () => {
    const cut = window({ endFrame: 15, advanced: 50, loopChanged: true })
    expect(paceWindow(cut, 0, clock()).total).toBe(50)
  })

  it('runs a non-looping playback off its end exactly once', () => {
    const once = clock({ startFrame: 3, endFrame: 50, loop: false })
    const pace = paceWindow(window({ startFrame: 5, endFrame: 3 }), 5, once)
    expect(pace.total).toBe(46)
    expect(stepPlayhead(5, 45, once)).toEqual({ frame: 50, stopped: false })
    expect(stepPlayhead(5, pace.total!, once)).toEqual({
      frame: 3,
      stopped: true,
    })
  })

  it('paces a window a seek ended at the estimate, never off a non-looping end', () => {
    const open = window({ startT: 0, endT: 4000 })
    expect(paceWindow(open, 0, clock()).total).toBe(100)
    expect(paceWindow(open, 0, clock(), 0.01).total).toBe(40)
    const once = clock({ endFrame: 30, loop: false })
    // The playback had not run off by the seek, or it would have stopped:
    // the frames it can have made spread across the window.
    const capped = paceWindow(open, 0, once)
    expect(capped.total).toBe(30)
    expect(advanceAt(capped, 2000)).toBe(15)
    expect(advanceAt(capped, 4000)).toBe(30)
  })

  it('keeps a window the take never closed playing at the estimate', () => {
    const open = window({ endIndex: undefined, endT: undefined })
    const pace = paceWindow(open, 0, clock(), 0.01)
    expect(pace.total).toBeUndefined()
    expect(advanceAt(pace, 11_000)).toBe(100)
  })

  it('jumps a window with no duration straight to its end', () => {
    const instant = window({ endT: 1000, endFrame: 4, advanced: 4 })
    const pace = paceWindow(instant, 0, clock())
    expect(advanceAt(pace, 1000)).toBe(4)
  })
})

describe('createPlayheadPacer', () => {
  it('walks the playhead through a take the way the render loop did', () => {
    const actions = [play(1000, 0), edit(2000), pause(3000, 50, 50)]
    const pacer = createPlayheadPacer(actions)
    const loop = clock()
    pacer.afterStep(0, 0, loop)
    expect(pacer.frameAt(1500, loop)).toBe(12)
    expect(pacer.frameAt(2000, loop)).toBe(25)
    // The edit keeps the window going; the frame never goes back.
    pacer.afterStep(1, 25, loop)
    expect(pacer.frameAt(1900, loop)).toBe(25)
    expect(pacer.frameAt(3000, loop)).toBe(50)
    pacer.afterStep(2, 50, loop)
    expect(pacer.current()).toBeUndefined()
    expect(pacer.frameAt(3500, loop)).toBeUndefined()
  })

  it('wraps by the loop as it stands at each move', () => {
    const setDuration = { t: 1000, id: 'timeline.setDuration', args: [29] }
    const actions = [play(0, 0), setDuration, pause(2000, 20, 50)]
    const pacer = createPlayheadPacer(actions)
    pacer.afterStep(0, 0, clock())
    expect(pacer.frameAt(1000, clock())).toBe(25)
    // The loop was cut to 0..29 inside the window: the rest wraps there.
    const cut = clock({ endFrame: 29 })
    pacer.afterStep(1, 25, cut)
    // 25 to 29, one to wrap, and 20 more.
    expect(pacer.frameAt(2000, cut)).toBe(20)
  })

  it('starts a window from where the step left the playhead', () => {
    const pacer = createPlayheadPacer([
      play(0, 0),
      seek(1000, 900),
      pause(2000, 24, 25),
    ])
    pacer.afterStep(0, 0, clock())
    // The seek was clamped to the end of the timeline when it ran.
    pacer.afterStep(1, 99, clock())
    expect(pacer.current()?.startFrame).toBe(900)
    expect(pacer.frameAt(1040, clock())).toBe(0)
    expect(pacer.frameAt(2000, clock())).toBe(24)
  })

  it('forgets everything on reset', () => {
    const pacer = createPlayheadPacer([play(0, 0), pause(1000, 25, 25)])
    pacer.afterStep(0, 0, clock())
    pacer.reset()
    expect(pacer.current()).toBeUndefined()
  })
})
