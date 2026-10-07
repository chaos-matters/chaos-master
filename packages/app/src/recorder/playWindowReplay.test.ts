import '@/commands/builtins'
import { createEffect, createRoot, createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import { createSessionPlayer } from './player'
import { cancelSessionRecording, recordSyntheticAction, reportDocumentWrite, startSessionRecording, stopSessionRecording, withRecordingSuppressed, } from './recorder'
import { timelineReplayPlayback } from './replayPlayback'
import { createReplayVideoSchedule } from './replayVideo'
import { SESSION_FORMAT_VERSION } from './schema'
import { snapshotOrigin } from './snapshotOrigin'
import { createRecorderAwareTimeline, snapshotTimeline, } from './timelineActions'
import type { ReplayTarget } from './replay'
import type { RecordedSession } from './schema'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineConfig, TimelineState } from '@/utils/timeline'

/**
 * A take's play windows, recorded live and replayed: the replay plays each
 * one at the pace the take played it and arrives on the frame the take
 * recorded, with no jump (recorder/playWindows.ts).
 *
 * The render loop below is `Flam3`'s with Auto FPS off, on fake timers, so a
 * test owns the clock of both the take and its replay and can check the
 * playhead frame by frame.
 */

type World = ReturnType<typeof makeWorld>

function makeWorld(seatId?: 'player') {
  const [flame, setFlameDescriptor] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(examples.example1)),
    { onEntryPushed: reportDocumentWrite },
  )
  const raw = createTimelineState(seatId ? { seatId } : {})
  const [blendFlame, setBlendFlame] = createSignal<FlameDescriptor>()
  const [blendWeight, setBlendWeight] = createSignal(0)
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const [zoom, setZoom] = createSignal(1)
  const [position, setPosition] = createSignal(vec2f(0, 0))
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const ctx: CommandContext = {
    flameDescriptor: () => flame,
    setFlameDescriptor,
    blendFlame,
    setBlendFlame: (next) => setBlendFlame(() => next),
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
      tracks: raw.tracks,
      setTracks: raw.setTracks,
      animationEnabled: raw.animationEnabled,
      setAnimationEnabled: raw.setAnimationEnabled,
      duration: () => raw.config().endFrame,
      setDuration: (duration) => {
        raw.updateConfigUndoable({ endFrame: duration })
      },
      currentFrame: raw.currentFrame,
      setCurrentFrame: (value) => {
        const frame =
          typeof value === 'function' ? value(raw.currentFrame()) : value
        raw.goToFrame(frame)
        return frame
      },
      play: raw.play,
      pause: raw.pause,
      isPlaying: raw.isPlaying,
      setLoop: (loop) => {
        raw.updateConfigUndoable({ loop })
      },
      setFps: (fps) => {
        raw.updateConfigUndoable({ fps })
      },
      addKeyframe: (path, frame, value) => {
        raw.addKeyframe(path, frame, value)
      },
    },
    camera: { center: () => undefined },
    modal: { open: () => undefined },
  }
  const facade = createRecorderAwareTimeline(raw, (id, ...args) => {
    executeCommand(id, ctx, ...args)
  })
  return { raw, facade, ctx, flame }
}

function configure(world: World, config: Partial<TimelineConfig>) {
  world.raw.setConfig({
    ...world.raw.config(),
    // 40 ms a frame, which fake timers keep exact.
    fps: 25,
    timeScale: 1,
    autoFps: false,
    startFrame: 0,
    endFrame: 600,
    loop: true,
    ...config,
  })
  world.raw.setAnimationEnabled(true)
}

/**
 * `Flam3`'s playback loop: while the timeline plays, advance `timeScale`
 * frames every 1000/fps ms, except while a replay paces the playhead.
 * `everyMs` stands in for a render loop slower than the configured fps, the
 * way Auto FPS or a busy main thread makes it.
 */
function driveRenderLoop(timeline: TimelineState, everyMs?: number) {
  return createRoot((dispose) => {
    createEffect(() => {
      if (!timeline.isPlaying() || timeline.pacedPlayback?.()) return
      const config = timeline.config()
      const interval = setInterval(
        () => {
          for (let i = 0; i < config.timeScale; i++) timeline.advanceFrame()
        },
        everyMs ?? 1000 / config.fps,
      )
      onCleanup(() => {
        clearInterval(interval)
      })
    })
    return dispose
  })
}

/** The workspace's replay target, reduced to what a timeline take needs. */
function replayTargetFor(world: World) {
  const steps: { id: string; args: unknown[]; frame: number; at: number }[] = []
  const target: ReplayTarget = {
    loadInitial: (flame) => {
      if (world.raw.isPlaying()) world.raw.pause()
      world.ctx.setFlameDescriptor(() => deepClone(flame))
    },
    loadTimeline: (data) => {
      world.raw.loadTracks(data.tracks)
      world.raw.setConfig(data.config)
      if (data.currentFrame !== undefined) {
        world.raw.setCurrentFrame(data.currentFrame)
      }
      if (data.animationEnabled !== undefined) {
        world.raw.setAnimationEnabled(data.animationEnabled)
      }
    },
    execute: (id, args) => {
      // Where the playhead stands the moment before the step runs.
      steps.push({ id, args, frame: world.raw.currentFrame(), at: Date.now() })
      return executeReplayCommand(id, world.ctx, ...args)
    },
    playback: timelineReplayPlayback(world.raw),
  }
  return { target, steps }
}

/** Every playhead the replay shows, in order, with whether it plays. */
function tracePlayhead(timeline: TimelineState) {
  const frames: { at: number; frame: number; playing: boolean }[] = []
  const dispose = createRoot((dispose) => {
    createEffect(() => {
      frames.push({
        at: Date.now(),
        frame: timeline.currentFrame(),
        playing: timeline.isPlaying(),
      })
    })
    return dispose
  })
  return { frames, dispose }
}

/** How many times the playhead moved backwards while it played. */
function backwardMoves(frames: { frame: number; playing: boolean }[]) {
  const moves: [number, number][] = []
  for (let i = 1; i < frames.length; i++) {
    const [before, after] = [frames[i - 1]!, frames[i]!]
    if (before.playing && after.playing && after.frame < before.frame) {
      moves.push([before.frame, after.frame])
    }
  }
  return moves
}

function stopOrThrow(): RecordedSession {
  const session = stopSessionRecording()
  if (!session) throw new Error('no active recording')
  return session
}

const steps = (session: RecordedSession) =>
  session.actions.map(({ id, args }) => [id, ...args])

afterEach(() => {
  cancelSessionRecording()
  vi.useRealTimers()
})

describe('a play window replays at the pace the take played it', () => {
  it('plays five seconds as five seconds and lands on the Pause frame with no jump', () => {
    vi.useFakeTimers()
    const live = makeWorld()
    configure(live, {})
    const stopLive = driveRenderLoop(live.raw)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    vi.advanceTimersByTime(500)
    live.facade.togglePlay()
    // Longer than the replay's longest paced gap between two steps.
    vi.advanceTimersByTime(5000)
    live.facade.togglePlay()
    const pausedAt = live.raw.currentFrame()
    const session = stopOrThrow()
    stopLive()

    expect(pausedAt).toBe(125)
    expect(steps(session)).toEqual([
      ['timeline.setPlaying', true, 0],
      ['timeline.setPlaying', false, 125, 125],
    ])

    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const trace = tracePlayhead(replay.raw)
    const player = createSessionPlayer(session, target)
    player.play()
    vi.advanceTimersByTime(20_000)
    stopReplay()
    trace.dispose()

    const [play, pause] = ran
    expect(player.isFinished()).toBe(true)
    // The window lasts as long as the take played, not a paced two seconds.
    expect(pause!.at - play!.at).toBe(5000)
    // The playhead is already on the recorded frame when the Pause runs.
    expect(pause!.frame).toBe(pausedAt)
    expect(replay.raw.currentFrame()).toBe(pausedAt)
    expect(backwardMoves(trace.frames)).toEqual([])
    // Halfway through, it is halfway there.
    const half = trace.frames.filter((f) => f.at <= play!.at + 2500).at(-1)
    expect(half?.frame).toBe(62)
  })

  it('wraps a looping playback as often as the take did', () => {
    vi.useFakeTimers()
    const live = makeWorld()
    configure(live, { endFrame: 47 })
    const stopLive = driveRenderLoop(live.raw)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    live.facade.togglePlay()
    vi.advanceTimersByTime(5000)
    live.facade.togglePlay()
    const session = stopOrThrow()
    stopLive()
    // 125 frames through a 48-frame loop: twice round, and 29 on.
    expect(steps(session).at(-1)).toEqual([
      'timeline.setPlaying',
      false,
      29,
      125,
    ])

    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const trace = tracePlayhead(replay.raw)
    createSessionPlayer(session, target).play()
    vi.advanceTimersByTime(20_000)
    stopReplay()
    trace.dispose()

    expect(ran.at(-1)?.frame).toBe(29)
    // The only backward moves are the two wraps, each from the end to the start.
    expect(backwardMoves(trace.frames)).toEqual([
      [47, 0],
      [47, 0],
    ])
  })

  it('reproduces a render loop slower than the configured fps', () => {
    vi.useFakeTimers()
    const live = makeWorld()
    configure(live, { fps: 30 })
    // What Auto FPS does: a frame advances only when it is good enough, here
    // ten times a second although the timeline says thirty.
    const stopLive = driveRenderLoop(live.raw, 100)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    live.facade.togglePlay()
    vi.advanceTimersByTime(3000)
    live.facade.togglePlay()
    const session = stopOrThrow()
    stopLive()
    expect(steps(session).at(-1)).toEqual([
      'timeline.setPlaying',
      false,
      30,
      30,
    ])

    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const trace = tracePlayhead(replay.raw)
    createSessionPlayer(session, target).play()
    vi.advanceTimersByTime(10_000)
    stopReplay()
    trace.dispose()

    const play = ran[0]!
    // Ten frames a second, as the take played, not thirty.
    const second = trace.frames.filter((f) => f.at <= play.at + 1000).at(-1)
    expect(second?.frame).toBe(10)
    expect(ran.at(-1)?.frame).toBe(30)
  })

  it('stops a non-looping playback where the take ran off its end', () => {
    vi.useFakeTimers()
    const live = makeWorld()
    configure(live, { startFrame: 3, endFrame: 50, loop: false })
    live.raw.goToFrame(5)
    const stopLive = driveRenderLoop(live.raw)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    live.facade.togglePlay()
    vi.advanceTimersByTime(4000)
    const session = stopOrThrow()
    stopLive()
    expect(steps(session)).toEqual([
      ['timeline.setPlaying', true, 5],
      ['timeline.setPlaying', false, 3, 46],
    ])

    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const trace = tracePlayhead(replay.raw)
    createSessionPlayer(session, target).play()
    vi.advanceTimersByTime(10_000)
    stopReplay()
    trace.dispose()

    // It plays on to the last frame, then goes back to the first and stops,
    // at the moment the take did.
    const playing = trace.frames.filter((f) => f.playing).map((f) => f.frame)
    expect(Math.max(...playing)).toBe(50)
    expect(ran[1]!.at - ran[0]!.at).toBe(
      session.actions[1]!.t - session.actions[0]!.t,
    )
    expect(replay.raw.isPlaying()).toBe(false)
    expect(replay.raw.currentFrame()).toBe(3)
  })

  it('starts a new window at a seek made while playing', () => {
    vi.useFakeTimers()
    const live = makeWorld()
    configure(live, {})
    const stopLive = driveRenderLoop(live.raw)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    live.facade.togglePlay()
    vi.advanceTimersByTime(1000)
    live.facade.goToFrame(300)
    vi.advanceTimersByTime(2000)
    live.facade.togglePlay()
    const session = stopOrThrow()
    stopLive()
    expect(steps(session)).toEqual([
      ['timeline.setPlaying', true, 0],
      ['timeline.setCurrentFrame', 300],
      ['timeline.setPlaying', false, 350, 50],
    ])

    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const trace = tracePlayhead(replay.raw)
    createSessionPlayer(session, target).play()
    vi.advanceTimersByTime(10_000)
    stopReplay()
    trace.dispose()

    // Before the seek the pace is the take's own, from the window it did
    // measure: 25 frames a second, so 25 frames in.
    expect(ran[1]!.frame).toBe(25)
    expect(ran[2]!.frame).toBe(350)
    // Nothing inside either window moves back.
    expect(backwardMoves(trace.frames)).toEqual([])
  })

  it('lands an edit made while playing at its recorded time and frame', () => {
    vi.useFakeTimers()
    const live = makeWorld()
    configure(live, {})
    const stopLive = driveRenderLoop(live.raw)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    live.facade.togglePlay()
    vi.advanceTimersByTime(250)
    executeCommand('flame.setGamma', live.ctx, 2.5)
    vi.advanceTimersByTime(1750)
    live.facade.togglePlay()
    const session = stopOrThrow()
    stopLive()
    expect(session.actions.map((action) => action.id)).toEqual([
      'timeline.setPlaying',
      'flame.setGamma',
      'timeline.setPlaying',
    ])

    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    createSessionPlayer(session, target).play()
    vi.advanceTimersByTime(10_000)
    stopReplay()

    // 250 ms after Play, not the 800 ms every other gap is floored to.
    expect(ran[1]!.at - ran[0]!.at).toBe(250)
    expect(ran[1]!.frame).toBe(6)
    expect(ran[2]!.frame).toBe(50)
    expect(replay.flame.renderSettings.gamma).toBe(2.5)
  })

  it('keeps the Pause frame when the replay speed changes inside the window', () => {
    vi.useFakeTimers()
    const session = recordPlayFor(4000)
    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const trace = tracePlayhead(replay.raw)
    const [speed, setSpeed] = createSignal(1)
    createSessionPlayer(session, target, { speed }).play()
    vi.advanceTimersByTime(1000)
    setSpeed(2)
    vi.advanceTimersByTime(10_000)
    stopReplay()
    trace.dispose()

    // One second at 1x, then the remaining three take-seconds at 2x. The
    // change lands on the next frame the replay draws, at most one late.
    expect(ran[1]!.at - ran[0]!.at - 2500).toBeGreaterThanOrEqual(0)
    expect(ran[1]!.at - ran[0]!.at - 2500).toBeLessThanOrEqual(16)
    expect(ran[1]!.frame).toBe(100)
    expect(backwardMoves(trace.frames)).toEqual([])
  })

  it('holds the playhead through a replay Pause and resumes from it', () => {
    vi.useFakeTimers()
    const session = recordPlayFor(4000)
    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const trace = tracePlayhead(replay.raw)
    const player = createSessionPlayer(session, target)
    player.play()
    vi.advanceTimersByTime(1500)
    player.pause()
    const heldAt = replay.raw.currentFrame()
    expect(heldAt).toBe(37)
    expect(replay.raw.isPlaying()).toBe(false)
    vi.advanceTimersByTime(5000)
    // A paused replay is a paused picture: the render loop does not move it.
    expect(replay.raw.currentFrame()).toBe(heldAt)
    player.play()
    expect(replay.raw.isPlaying()).toBe(true)
    vi.advanceTimersByTime(10_000)
    stopReplay()
    trace.dispose()

    expect(ran[1]!.frame).toBe(100)
    expect(ran[1]!.at - ran[0]!.at).toBe(4000 + 5000)
    expect(backwardMoves(trace.frames)).toEqual([])
  })

  it('seeks into a window paused and restarts it from the baseline', () => {
    vi.useFakeTimers()
    const session = recordPlayFor(4000)
    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target } = replayTargetFor(replay)
    const player = createSessionPlayer(session, target)
    player.seek(0)
    // The step that started playback, with the replay not playing.
    expect(replay.raw.currentFrame()).toBe(0)
    expect(replay.raw.isPlaying()).toBe(false)
    vi.advanceTimersByTime(2000)
    expect(replay.raw.currentFrame()).toBe(0)
    player.play()
    vi.advanceTimersByTime(2000)
    expect(replay.raw.currentFrame()).toBe(50)
    // Back to the start: every take starts paused.
    player.seek(-1)
    expect(replay.raw.isPlaying()).toBe(false)
    player.play()
    vi.advanceTimersByTime(10_000)
    stopReplay()
    expect(player.isFinished()).toBe(true)
    expect(replay.raw.currentFrame()).toBe(100)
  })

  it('ends a take stopped while playing on the frame the playback had, still playing', () => {
    vi.useFakeTimers()
    const [live, dispose] = createRoot(
      (dispose) => [makeWorld('player'), dispose] as const,
    )
    configure(live, {})
    const stopLive = driveRenderLoop(live.raw)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    live.facade.togglePlay()
    vi.advanceTimersByTime(3000)
    const session = stopOrThrow()
    stopLive()
    dispose()
    expect(steps(session)).toEqual([
      ['timeline.setPlaying', true, 0],
      ['timeline.setPlaying', true, 75, 75],
    ])
    expect(session.actions.at(-1)?.label).toBe('Still playing at frame 75')

    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const player = createSessionPlayer(session, target)
    player.play()
    vi.advanceTimersByTime(3000)
    expect(ran[1]!.frame).toBe(75)
    expect(player.isFinished()).toBe(true)
    // The take left it playing, so the replay does, on the timeline's clock.
    expect(replay.raw.isPlaying()).toBe(true)
    expect(replay.raw.pacedPlayback()).toBe(false)
    // Closing a replay that has finished leaves it playing too: the replay no
    // longer holds the playhead, so there is nothing of its to stop.
    player.stop()
    expect(replay.raw.isPlaying()).toBe(true)
    vi.advanceTimersByTime(1000)
    stopReplay()
    expect(replay.raw.currentFrame()).toBe(100)
  })

  it('still replays a take recorded before the Pause carried its count', () => {
    vi.useFakeTimers()
    // A take maff recorded on 2026-09-23: two arguments, 36 frames in 2161 ms
    // at a nominal 30 fps, which a replay on its own clock overshot to 81.
    const session: RecordedSession = {
      version: SESSION_FORMAT_VERSION,
      app: { version: 'test', flameSchemaVersion: '1.0' },
      createdAt: new Date(0).toISOString(),
      initial: deepClone(examples.example1),
      initialTimeline: {
        config: {
          fps: 30,
          timeScale: 1,
          startFrame: 0,
          endFrame: 90,
          loop: true,
          autoFps: false,
          loopMode: 'off',
        },
        currentFrame: 0,
        animationEnabled: true,
        autoKeyframe: true,
        previewHeld: false,
        tracks: [],
      },
      actions: [
        { t: 11_002, id: 'timeline.setPlaying', args: [true, 22] },
        { t: 13_163, id: 'timeline.setPlaying', args: [false, 58] },
      ],
      unnamedWriteCount: 0,
    }
    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target, steps: ran } = replayTargetFor(replay)
    const trace = tracePlayhead(replay.raw)
    createSessionPlayer(session, target).play()
    vi.advanceTimersByTime(10_000)
    stopReplay()
    trace.dispose()

    expect(ran[1]!.at - ran[0]!.at).toBe(2161)
    expect(ran[1]!.frame).toBe(58)
    expect(backwardMoves(trace.frames)).toEqual([])
  })
})

describe('a replay that ends early inside a window pauses the timeline where it is', () => {
  /** A replay the viewer can take over, with the steps that failed. */
  function replayWithTakeover(session: RecordedSession) {
    const replay = makeWorld()
    const stopReplay = driveRenderLoop(replay.raw)
    const { target } = replayTargetFor(replay)
    let owner: (() => void) | undefined
    target.beginBatch = (onTakeover) => {
      owner = onTakeover
    }
    target.endBatch = () => {
      owner = undefined
    }
    const errors: string[] = []
    const player = createSessionPlayer(session, target, {
      onError: (message) => errors.push(message),
    })
    return { replay, player, errors, stopReplay, takeOver: () => owner?.() }
  }

  /** A take the viewer starts now, to show the replay's pause is no step. */
  function recordOn(world: World) {
    startSessionRecording(world.flame, {
      timeline: snapshotTimeline(world.raw),
    })
  }

  /** Paused on `frame`, off the replay's clock, and staying there. */
  function expectPausedOn(world: World, frame: number) {
    expect(world.raw.isPlaying()).toBe(false)
    expect(world.raw.pacedPlayback()).toBe(false)
    expect(world.raw.currentFrame()).toBe(frame)
    vi.advanceTimersByTime(2000)
    expect(world.raw.currentFrame()).toBe(frame)
  }

  it('pauses on the frame it had when the replay is closed', () => {
    vi.useFakeTimers()
    const { replay, player, stopReplay } = replayWithTakeover(
      recordPlayFor(4000),
    )
    player.play()
    vi.advanceTimersByTime(1500)
    recordOn(replay)
    player.stop()
    expectPausedOn(replay, 37)
    expect(steps(stopOrThrow())).toEqual([])
    stopReplay()
  })

  it('pauses on the frame it had when the viewer takes the document over', () => {
    vi.useFakeTimers()
    const { replay, player, stopReplay, takeOver } = replayWithTakeover(
      recordPlayFor(4000),
    )
    player.play()
    vi.advanceTimersByTime(1500)
    recordOn(replay)
    takeOver()
    expect(player.isPlaying()).toBe(false)
    expectPausedOn(replay, 37)
    expect(steps(stopOrThrow())).toEqual([])
    stopReplay()
  })

  it('pauses on the frame the failed step ran on', () => {
    vi.useFakeTimers()
    const live = makeWorld()
    configure(live, {})
    const stopLive = driveRenderLoop(live.raw)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    live.facade.togglePlay()
    vi.advanceTimersByTime(250)
    executeCommand('flame.setGamma', live.ctx, 2.5)
    vi.advanceTimersByTime(1750)
    live.facade.togglePlay()
    const session = stopOrThrow()
    stopLive()

    const { replay, player, errors, stopReplay } = replayWithTakeover(session)
    player.play()
    vi.advanceTimersByTime(100)
    // A take started mid-replay fails the next step: replay refuses to run
    // under a recording.
    recordOn(replay)
    vi.advanceTimersByTime(150)
    expect(errors).toEqual([
      'Step 2 could not be replayed: Stop the active recording before continuing replay',
    ])
    expectPausedOn(replay, 6)
    expect(steps(stopOrThrow())).toEqual([])
    stopReplay()
  })

  it('pauses on Space pressed inside the window, as the press meant', () => {
    vi.useFakeTimers()
    const { replay, player, stopReplay, takeOver } = replayWithTakeover(
      recordPlayFor(4000),
    )
    // The transport the viewer presses takes the replay over first.
    const transport = createRecorderAwareTimeline(
      replay.raw,
      (id, ...args) => {
        executeCommand(id, replay.ctx, ...args)
      },
      takeOver,
    )
    player.play()
    vi.advanceTimersByTime(1500)
    transport.togglePlay()
    expect(player.isPlaying()).toBe(false)
    expectPausedOn(replay, 37)
    stopReplay()
  })
})

describe('the video schedule keeps a play window as long as the take', () => {
  it('gives the interface capture the same window the player plays', () => {
    vi.useFakeTimers()
    const session = recordPlayFor(6000)
    const schedule = createReplayVideoSchedule(session, 1)
    const [play, pause] = schedule.actionTimesMs
    // The interface export screen-records the player and validates its
    // budget from this schedule, so the two must agree on the window.
    expect(Math.round(pause! - play!)).toBe(6000)
    expect(schedule.playing).toEqual([true, false])
  })
})

/** A take that plays for `ms` from frame 0 at 25 fps, then pauses. */
function recordPlayFor(ms: number): RecordedSession {
  const live = makeWorld()
  configure(live, {})
  const stopLive = driveRenderLoop(live.raw)
  startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
  live.facade.togglePlay()
  vi.advanceTimersByTime(ms)
  live.facade.togglePlay()
  const session = stopOrThrow()
  stopLive()
  return session
}

/**
 * A plain flame loaded while the timeline plays (code audit 2026-09-23, F2).
 *
 * The load stops playback. It used to do that through the timeline's raw
 * `setIsPlaying`, inside the block that keeps the load's own writes out of the
 * take, so the take held no Pause: its replay read the load's timeline
 * snapshot as a seek while playing and played on over the rest of the take,
 * which the viewer had watched with the timeline stopped. `MainWorkspace`
 * now stops through `pause()` before that block, which the take records.
 */
describe('a plain-flame load while playing', () => {
  /** The timeline half of `MainWorkspace`'s load effect, in its order. */
  function loadPlainFlame(world: World, stop: 'pause' | 'raw setter') {
    if (stop === 'pause') world.raw.pause()
    withRecordingSuppressed(() => {
      world.raw.loadTracks([])
      if (stop === 'raw setter') world.raw.setIsPlaying(false)
      world.raw.setAnimationEnabled(false)
    })
    recordSyntheticAction(
      'timeline.loadTimeline',
      [snapshotTimeline(world.raw), snapshotOrigin('timeline.clear')],
      'Clear animation',
    )
  }

  function takeWithLoad(stop: 'pause' | 'raw setter') {
    const [live, dispose] = createRoot(
      (dispose) => [makeWorld('player'), dispose] as const,
    )
    configure(live, {})
    const stopLive = driveRenderLoop(live.raw)
    startSessionRecording(live.flame, { timeline: snapshotTimeline(live.raw) })
    live.facade.togglePlay()
    vi.advanceTimersByTime(2000)
    loadPlainFlame(live, stop)
    const stoppedAt = live.raw.currentFrame()
    vi.advanceTimersByTime(3000)
    executeCommand('flame.setExposure', live.ctx, 0.9)
    const session = stopOrThrow()
    stopLive()
    dispose()
    return { session, stoppedAt }
  }

  function replay(session: RecordedSession) {
    const world = makeWorld()
    const stopReplay = driveRenderLoop(world.raw)
    const { target, steps: ran } = replayTargetFor(world)
    const player = createSessionPlayer(session, target)
    player.play()
    vi.advanceTimersByTime(10_000)
    stopReplay()
    return { world, ran, player }
  }

  it('records the Pause, so the replay stops where the take did', () => {
    vi.useFakeTimers()
    const { session, stoppedAt } = takeWithLoad('pause')
    expect(steps(session).map(([id]) => id)).toEqual([
      'timeline.setPlaying',
      'timeline.setPlaying',
      'timeline.loadTimeline',
      'flame.setExposure',
    ])
    expect(steps(session)[1]).toEqual([
      'timeline.setPlaying',
      false,
      stoppedAt,
      stoppedAt,
    ])
    const { world, ran, player } = replay(session)
    expect(player.isFinished()).toBe(true)
    // The edit after the load runs on the stopped playhead, as it did live.
    expect(ran.at(-1)).toMatchObject({
      id: 'flame.setExposure',
      frame: stoppedAt,
    })
    expect(world.raw.isPlaying()).toBe(false)
  })

  it('the raw setter it replaces left the replay playing (the bug)', () => {
    vi.useFakeTimers()
    const { session, stoppedAt } = takeWithLoad('raw setter')
    expect(steps(session).map(([id]) => id)).toEqual([
      'timeline.setPlaying',
      'timeline.loadTimeline',
      'flame.setExposure',
    ])
    const { world, ran } = replay(session)
    expect(ran.at(-1)!.frame).toBeGreaterThan(stoppedAt)
    expect(world.raw.isPlaying()).toBe(true)
  })
})
