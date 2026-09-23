import '@/commands/builtins'
import { createEffect, createRoot, createSignal, onCleanup } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetPilot, startPilot } from '@/arcade/pilot'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import { createSessionPlayer } from './player'
import { cancelSessionRecording, reportDocumentWrite, startSessionRecording, stopSessionRecording, withRecordingSuppressed, } from './recorder'
import { snapshotOrigin } from './snapshotOrigin'
import { createRecorderAwareTimeline, runTimelineSnapshotMutation, snapshotTimeline, } from './timelineActions'
import type { ReplayTarget } from './replay'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { TimelineState } from '@/utils/timeline'

function makeTimelineWorld() {
  const [flame, setFlameDescriptor] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(examples.example1)),
    { onEntryPushed: reportDocumentWrite },
  )
  const raw = createTimelineState()
  const [blendFlame, setBlendFlame] = createSignal<FlameDescriptor>()
  const [blendWeight, setBlendWeight] = createSignal(0)
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const [zoom, setZoom] = createSignal(1)
  const [position, setPosition] = createSignal(vec2f(0, 0))
  const [sidebarOpen, setSidebarOpen] = createSignal(false)

  const loadSnapshot = (data: TimelineSnapshot) => {
    raw.loadTracks(data.tracks)
    raw.setConfig(data.config)
    if (data.currentFrame !== undefined) raw.setCurrentFrame(data.currentFrame)
    if (data.animationEnabled !== undefined) {
      raw.setAnimationEnabled(data.animationEnabled)
    }
    if (data.autoKeyframe !== undefined) raw.setAutoKeyframe(data.autoKeyframe)
    if (data.previewHeld !== undefined) raw.setPreviewHeld(data.previewHeld)
  }

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
      setDuration: (duration, coalesceId) => {
        raw.updateConfigUndoable({ endFrame: duration }, coalesceId)
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
      setFps: (fps, coalesceId) => {
        raw.updateConfigUndoable({ fps }, coalesceId)
      },
      setAutoFps: (autoFps) => {
        raw.updateConfigUndoable({ autoFps })
      },
      setTimeScale: (timeScale, coalesceId) => {
        raw.updateConfigUndoable({ timeScale }, coalesceId)
      },
      addKeyframe: (path, frame, value, easing, interp) => {
        raw.addKeyframe(
          path,
          frame,
          value,
          easing as Parameters<typeof raw.addKeyframe>[3],
          interp as Parameters<typeof raw.addKeyframe>[4],
        )
      },
      edit: {
        removeKeyframe: raw.removeKeyframe,
        setKeyframeValue: (path, frame, value, easing, interp) => {
          raw.setKeyframeValue(
            path,
            frame,
            value,
            easing as Parameters<typeof raw.setKeyframeValue>[3],
            interp as Parameters<typeof raw.setKeyframeValue>[4],
          )
        },
        setKeyframeInterp: (path, frame, interp) => {
          raw.setKeyframeInterp(
            path,
            frame,
            interp as Parameters<typeof raw.setKeyframeInterp>[2],
          )
        },
        moveKeyframe: raw.moveKeyframe,
        relocateKeyframe: raw.relocateKeyframe,
        addKeyframeValuesAtFrame: raw.addKeyframeValuesAtFrame,
        removeTrack: raw.removeTrack,
        clearTracks: raw.clearAllTracks,
        setLoopMode: raw.setLoopMode,
        setAutoKeyframe: raw.setAutoKeyframe,
        snapshot: () => snapshotTimeline(raw),
        load: loadSnapshot,
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

function stopOrThrow() {
  const session = stopSessionRecording()
  if (!session) throw new Error('no active recording')
  return session
}

afterEach(() => {
  cancelSessionRecording()
})

describe('recorder-aware timeline actions', () => {
  it('pins multi-keyframe values and coalesces only within one gesture', () => {
    createRoot((dispose) => {
      const world = makeTimelineWorld()
      const values = new Map<string, number>([
        ['exposure', 1],
        ['gamma', 2],
      ])
      world.raw.setValueResolver((path) => values.get(path) ?? null)
      startSessionRecording(world.flame, {
        timeline: snapshotTimeline(world.raw),
      })

      world.facade.addKeyframesAtCurrentFrame(['exposure', 'gamma'])
      values.set('exposure', 3)
      values.set('gamma', 4)
      world.facade.addKeyframesAtCurrentFrame(['exposure', 'gamma'])
      world.facade.breakUndoCoalescing()
      values.set('exposure', 5)
      values.set('gamma', 6)
      world.facade.addKeyframesAtCurrentFrame(['exposure', 'gamma'])

      const session = stopOrThrow()
      expect(session.unnamedWriteCount).toBe(0)
      expect(session.actions.map((action) => action.id)).toEqual([
        'timeline.addKeyframes',
        'timeline.addKeyframes',
      ])
      expect(session.actions[0]?.args[0]).toEqual([
        ['exposure', 3],
        ['gamma', 4],
      ])
      expect(session.actions[1]?.args[0]).toEqual([
        ['exposure', 5],
        ['gamma', 6],
      ])
      dispose()
    })
  })

  it('retains one timeline undo entry for a coalesced keyframe gesture', () => {
    createRoot((dispose) => {
      const world = makeTimelineWorld()
      let value = 1
      world.raw.setValueResolver(() => value)
      world.facade.addKeyframesAtCurrentFrame(['exposure'])
      value = 2
      world.facade.addKeyframesAtCurrentFrame(['exposure'])

      world.raw.timelineUndo()
      expect(world.raw.tracks()).toEqual([])
      dispose()
    })
  })

  it('replays value-pinned keyframes without consulting a different resolver', () => {
    createRoot((dispose) => {
      const source = makeTimelineWorld()
      source.raw.setValueResolver((path) =>
        path === 'exposure' ? 1.25 : path === 'gamma' ? 2.5 : null,
      )
      startSessionRecording(source.flame, {
        timeline: snapshotTimeline(source.raw),
      })
      source.facade.addKeyframesAtCurrentFrame(['exposure', 'gamma'])
      const session = stopOrThrow()

      const target = makeTimelineWorld()
      target.raw.setValueResolver(() => 999)
      for (const action of session.actions) {
        expect(
          executeReplayCommand(action.id, target.ctx, ...action.args),
        ).toBe(true)
      }
      expect(target.raw.tracks()).toEqual(source.raw.tracks())
      dispose()
    })
  })

  it('round-trips timeline settings and keyframe authoring through commands', () => {
    createRoot((dispose) => {
      const source = makeTimelineWorld()
      startSessionRecording(source.flame, {
        timeline: snapshotTimeline(source.raw),
      })

      source.facade.updateConfigUndoable({ fps: 37 })
      source.facade.updateConfigUndoable({ autoFps: true })
      source.facade.updateConfigUndoable({ timeScale: 2.5 })
      source.facade.updateConfigUndoable({ endFrame: 180 })
      source.facade.updateConfigUndoable({ loop: false })
      source.facade.setLoopMode('cycle')
      source.facade.setAnimationEnabled(true)
      source.facade.setAutoKeyframe(true)
      source.facade.goToFrame(7)
      source.facade.addKeyframe('gamma', 0, 1, 'easeIn', 'linear')
      source.facade.setKeyframeValue('gamma', 0, 2, 'easeOut', 'spline')
      source.facade.moveKeyframe('gamma', 0, 12)

      const session = stopOrThrow()
      expect(session.unnamedWriteCount).toBe(0)

      const target = makeTimelineWorld()
      for (const action of session.actions) {
        expect(
          executeReplayCommand(action.id, target.ctx, ...action.args),
        ).toBe(true)
      }
      expect(snapshotTimeline(target.raw)).toEqual(snapshotTimeline(source.raw))
      dispose()
    })
  })

  it('records a compound edit as one snapshot and preserves its return value', () => {
    createRoot((dispose) => {
      const world = makeTimelineWorld()
      startSessionRecording(world.flame, {
        timeline: snapshotTimeline(world.raw),
      })

      const result = world.facade.runWithSingleUndo(() => {
        world.facade.addKeyframe('exposure', 0, 1)
        world.facade.addKeyframe('gamma', 12, 2)
        world.facade.updateConfigUndoable({ endFrame: 120, loop: false })
        return 7
      })

      const session = stopOrThrow()
      expect(result).toBe(7)
      expect(session.unnamedWriteCount).toBe(0)
      expect(session.actions).toHaveLength(1)
      expect(session.actions[0]?.id).toBe('timeline.loadTimeline')
      expect(session.actions[0]?.args[0]).toEqual(snapshotTimeline(world.raw))

      world.raw.timelineUndo()
      expect(world.raw.tracks()).toEqual([])
      dispose()
    })
  })

  it('keeps the semantic origin of a value-pinned compound edit', () => {
    createRoot((dispose) => {
      const world = makeTimelineWorld()
      startSessionRecording(world.flame, {
        timeline: snapshotTimeline(world.raw),
      })

      const origin = snapshotOrigin('timeline.preset', 'Slow Orbit')
      runTimelineSnapshotMutation(world.facade, origin, () => {
        world.facade.addKeyframe('camera3D.theta', 0, 0)
        world.facade.addKeyframe('camera3D.theta', 90, Math.PI * 2)
      })

      const session = stopOrThrow()
      expect(session.unnamedWriteCount).toBe(0)
      expect(session.actions).toHaveLength(1)
      expect(session.actions[0]).toMatchObject({
        id: 'timeline.loadTimeline',
        label: 'Apply Animation Preset: Slow Orbit',
        focus: 'ui:animation-presets',
      })
      expect(session.actions[0]?.args[1]).toEqual(origin)
      dispose()
    })
  })

  it('relinquishes replay before a raw compound mutation emits its snapshot', () => {
    createRoot((dispose) => {
      const raw = createTimelineState()
      const observed: number[] = []
      const facade = createRecorderAwareTimeline(
        raw,
        () => {
          throw new Error('compound mutation should emit a synthetic action')
        },
        () => {
          observed.push(raw.config().endFrame)
        },
      )

      // Multiple settings use the raw-then-synthetic snapshot path. The
      // takeover boundary must run while the old state is still intact.
      facade.updateConfigUndoable({ fps: 24, endFrame: 120 })

      expect(observed).toEqual([90])
      expect(raw.config().fps).toBe(24)
      expect(raw.config().endFrame).toBe(120)
      dispose()
    })
  })

  it('relinquishes replay before user playback transport changes state', () => {
    createRoot((dispose) => {
      const raw = createTimelineState()
      const observed: Array<{ operation: string; playing: boolean }> = []
      let operation = 'play'
      const facade = createRecorderAwareTimeline(
        raw,
        () => {
          throw new Error('wall-clock transport is not a replay command')
        },
        () => {
          observed.push({ operation, playing: raw.isPlaying() })
        },
      )

      facade.play()
      expect(raw.isPlaying()).toBe(true)
      operation = 'pause'
      facade.pause()
      expect(raw.isPlaying()).toBe(false)
      operation = 'toggle'
      facade.togglePlay()
      expect(raw.isPlaying()).toBe(true)

      expect(observed).toEqual([
        { operation: 'play', playing: false },
        { operation: 'pause', playing: true },
        { operation: 'toggle', playing: false },
      ])
      dispose()
    })
  })

  it('does not emit a phantom snapshot for a no-op compound edit', () => {
    createRoot((dispose) => {
      const world = makeTimelineWorld()
      startSessionRecording(world.flame, {
        timeline: snapshotTimeline(world.raw),
      })
      expect(world.facade.runWithSingleUndo(() => 'unchanged')).toBe(
        'unchanged',
      )
      const session = stopOrThrow()
      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(0)
      dispose()
    })
  })

  it('keeps command coalescing through suppressed writes, then breaks it explicitly', () => {
    createRoot((dispose) => {
      const world = makeTimelineWorld()
      startSessionRecording(world.flame, {
        timeline: snapshotTimeline(world.raw),
      })

      world.facade.updateConfigUndoable({ fps: 24 }, 'fps')
      world.facade.updateConfigUndoable({ fps: 25 }, 'fps')
      // Internal writes of a suppressed compound must not clear the first
      // command's anchor. This direct suppression models the facade's batch.
      withRecordingSuppressed(() => {
        world.raw.addKeyframe('exposure', 0, 1)
        world.raw.removeKeyframe('exposure', 0)
      })
      world.facade.updateConfigUndoable({ fps: 26 }, 'fps')
      world.facade.breakUndoCoalescing()
      world.facade.updateConfigUndoable({ fps: 27 }, 'fps')

      const session = stopOrThrow()
      expect(session.unnamedWriteCount).toBe(0)
      expect(session.actions.map((action) => action.args[0])).toEqual([26, 27])
      dispose()
    })
  })

  it('coalesces a scrubbed seek and keeps the next click as a separate action', () => {
    createRoot((dispose) => {
      const world = makeTimelineWorld()
      startSessionRecording(world.flame, {
        timeline: snapshotTimeline(world.raw),
      })
      world.facade.setIsScrubbing(true)
      world.facade.goToFrame(5)
      world.facade.goToFrame(8)
      world.facade.setIsScrubbing(false)
      world.facade.goToFrame(12)

      const session = stopOrThrow()
      expect(session.unnamedWriteCount).toBe(0)
      expect(
        session.actions.map((action) => [action.id, action.args[0]]),
      ).toEqual([
        ['timeline.setCurrentFrame', 8],
        ['timeline.setCurrentFrame', 12],
      ])
      dispose()
    })
  })

  it('records paused previous/next buttons as deterministic frame actions', () => {
    createRoot((dispose) => {
      const world = makeTimelineWorld()
      world.raw.setConfig({
        ...world.raw.config(),
        startFrame: 0,
        endFrame: 2,
        loop: false,
      })
      startSessionRecording(world.flame, {
        timeline: snapshotTimeline(world.raw),
      })

      world.facade.advanceFrame()
      world.facade.goBackFrame()
      world.facade.goBackFrame()

      const session = stopOrThrow()
      expect(session.unnamedWriteCount).toBe(0)
      expect(
        session.actions.map((action) => [action.id, action.args[0]]),
      ).toEqual([
        ['timeline.setCurrentFrame', 1],
        ['timeline.setCurrentFrame', 0],
        ['timeline.setCurrentFrame', 0],
      ])
      dispose()
    })
  })

  it('folds a curve drag into one original-to-final retime and one final value', () => {
    createRoot((dispose) => {
      const source = makeTimelineWorld()
      source.raw.addKeyframe('gamma', 0, 1)
      startSessionRecording(source.flame, {
        timeline: snapshotTimeline(source.raw),
      })

      source.facade.breakUndoCoalescing()
      source.facade.relocateKeyframe('gamma', 0, 1)
      source.facade.setKeyframeValue('gamma', 1, 2)
      source.facade.relocateKeyframe('gamma', 1, 2)
      source.facade.setKeyframeValue('gamma', 2, 3)
      source.facade.breakUndoCoalescing()

      const session = stopOrThrow()
      expect(session.actions.map((action) => [action.id, action.args])).toEqual(
        [
          ['timeline.relocateKeyframe', ['gamma', 0, 2]],
          ['timeline.setKeyframeValue', ['gamma', 2, 3, null, null]],
        ],
      )

      const target = makeTimelineWorld()
      target.raw.addKeyframe('gamma', 0, 1)
      for (const action of session.actions) {
        expect(
          executeReplayCommand(action.id, target.ctx, ...action.args),
        ).toBe(true)
      }
      expect(target.raw.getKeyframeAtFrame('gamma', 2)?.value).toBe(3)
      expect(target.raw.hasKeyframeAtFrame('gamma', 0)).toBe(false)
      dispose()
    })
  })

  it('keeps separate dope-sheet drags chronological even when origins repeat', () => {
    createRoot((dispose) => {
      const source = makeTimelineWorld()
      source.raw.addKeyframe('gamma', 1, 1)
      startSessionRecording(source.flame, {
        timeline: snapshotTimeline(source.raw),
      })

      source.facade.moveKeyframe('gamma', 1, 2)
      source.facade.moveKeyframe('gamma', 2, 1)
      source.facade.moveKeyframe('gamma', 1, 3)

      const session = stopOrThrow()
      expect(session.actions.map((action) => action.args)).toEqual([
        ['gamma', 1, 2],
        ['gamma', 2, 1],
        ['gamma', 1, 3],
      ])

      const target = makeTimelineWorld()
      target.raw.addKeyframe('gamma', 1, 1)
      for (const action of session.actions) {
        expect(
          executeReplayCommand(action.id, target.ctx, ...action.args),
        ).toBe(true)
      }
      expect(target.raw.hasKeyframeAtFrame('gamma', 3)).toBe(true)
      expect(target.raw.hasKeyframeAtFrame('gamma', 1)).toBe(false)
      dispose()
    })
  })
})

/**
 * Play and Pause are transport, and they used to be the one thing a take could
 * not carry: the first press anywhere in a recording counted as "not
 * captured", and a replay left the playhead wherever its own clock put it. A
 * press is now a `timeline.setPlaying` step that pins the frame, so a replay
 * pauses where the recording paused rather than wherever the paced replay
 * happened to have got to.
 *
 * Deliberately NOT wrapped in `createRoot`: the render loop below is an effect
 * that has to see each Play and Pause as its own update, the way it does in
 * the app (see `utils/timeline.test.ts` for the same reason).
 */
describe('Play and Pause during a recording', () => {
  afterEach(() => {
    resetPilot()
    vi.useRealTimers()
  })

  /**
   * The render loop, as `Flam3` runs it with Auto FPS off: while the timeline
   * plays, advance `timeScale` frames every 1000/fps ms, through the timeline
   * the workspace context hands the canvas. Fake timers make it a clock the
   * test owns, which is what lets a replay be checked frame for frame.
   */
  function driveRenderLoop(timeline: TimelineState): () => void {
    return createRoot((dispose) => {
      createEffect(() => {
        if (!timeline.isPlaying()) return
        const config = timeline.config()
        const interval = setInterval(() => {
          for (let i = 0; i < config.timeScale; i++) timeline.advanceFrame()
        }, 1000 / config.fps)
        onCleanup(() => {
          clearInterval(interval)
        })
      })
      return dispose
    })
  }

  /** The workspace's replay target, reduced to what a timeline take needs. */
  function replayTargetFor(
    world: ReturnType<typeof makeTimelineWorld>,
  ): ReplayTarget {
    return {
      loadInitial: (flame) => {
        // As hooks/useWorkspaceReplay.ts does: a take starts paused, so a
        // rebuild must not keep playback a later step started.
        if (world.raw.isPlaying()) world.raw.pause()
        world.ctx.setFlameDescriptor(() => deepClone(flame))
      },
      loadTimeline: (data) => {
        world.ctx.timeline.edit?.load(data)
      },
      execute: (id, args) => executeReplayCommand(id, world.ctx, ...args),
    }
  }

  function configure(
    world: ReturnType<typeof makeTimelineWorld>,
    config: { startFrame: number; endFrame: number; loop: boolean },
  ) {
    world.raw.setConfig({
      ...world.raw.config(),
      ...config,
      fps: 24,
      timeScale: 1,
      autoFps: false,
    })
    world.raw.setAnimationEnabled(true)
  }

  const steps = (session: { actions: { id: string; args: unknown[] }[] }) =>
    session.actions.map(({ id, args }) => [id, ...args])

  it('records Space pressed twice as two steps and replays to the paused frame', () => {
    vi.useFakeTimers()
    const live = makeTimelineWorld()
    configure(live, { startFrame: 0, endFrame: 600, loop: true })
    const stopLive = driveRenderLoop(live.facade)
    startSessionRecording(live.flame, {
      timeline: snapshotTimeline(live.raw),
    })

    vi.advanceTimersByTime(500)
    live.facade.togglePlay()
    // Longer than the replay's longest paced gap, so a replay that only
    // played for as long as it waits between steps would stop short.
    vi.advanceTimersByTime(5000)
    live.facade.togglePlay()
    const pausedAt = live.raw.currentFrame()
    const session = stopOrThrow()
    stopLive()

    expect(session.unnamedWriteCount).toBe(0)
    expect(pausedAt).toBeGreaterThan(100)
    // The Pause also counts the frames the playback advanced, which from
    // frame 0 without a wrap is the frame it paused on.
    expect(steps(session)).toEqual([
      ['timeline.setPlaying', true, 0],
      ['timeline.setPlaying', false, pausedAt, pausedAt],
    ])

    const replay = makeTimelineWorld()
    const stopReplay = driveRenderLoop(replay.facade)
    const player = createSessionPlayer(session, replayTargetFor(replay))
    player.play()
    // The replay plays the animation between the two steps, on its own clock...
    vi.advanceTimersByTime(1200)
    expect(replay.raw.isPlaying()).toBe(true)
    expect(replay.raw.currentFrame()).toBeGreaterThan(0)
    // ...and pauses exactly where the recording paused. This target has no
    // playback hold, so the clock is the replay's own; the paced replay
    // (playWindowReplay.test.ts) also moves the frames at the take's pace.
    vi.advanceTimersByTime(10_000)
    stopReplay()
    expect(player.isFinished()).toBe(true)
    expect(replay.raw.isPlaying()).toBe(false)
    expect(replay.raw.currentFrame()).toBe(pausedAt)
  })

  it('pins the frame a playback stops on when it reaches the end by itself', () => {
    vi.useFakeTimers()
    const live = makeTimelineWorld()
    configure(live, { startFrame: 3, endFrame: 15, loop: false })
    live.raw.goToFrame(5)
    const stopLive = driveRenderLoop(live.facade)
    startSessionRecording(live.flame, {
      timeline: snapshotTimeline(live.raw),
    })

    live.facade.togglePlay()
    vi.advanceTimersByTime(2000)
    const session = stopOrThrow()
    stopLive()

    // A non-looping playback that runs off the end goes back to the first
    // frame and stops there. Nobody pressed anything, and it is still a step.
    expect(live.raw.isPlaying()).toBe(false)
    expect(live.raw.currentFrame()).toBe(3)
    expect(session.unnamedWriteCount).toBe(0)
    // Five to fifteen is ten advances, and the eleventh ran off the end.
    expect(steps(session)).toEqual([
      ['timeline.setPlaying', true, 5],
      ['timeline.setPlaying', false, 3, 11],
    ])

    const replay = makeTimelineWorld()
    const stopReplay = driveRenderLoop(replay.facade)
    createSessionPlayer(session, replayTargetFor(replay)).play()
    vi.advanceTimersByTime(10_000)
    stopReplay()
    expect(replay.raw.isPlaying()).toBe(false)
    expect(replay.raw.currentFrame()).toBe(3)
  })

  it('records a pause that a workspace flow makes on the raw timeline', () => {
    vi.useFakeTimers()
    const live = makeTimelineWorld()
    configure(live, { startFrame: 0, endFrame: 600, loop: true })
    const stopLive = driveRenderLoop(live.facade)
    startSessionRecording(live.flame, {
      timeline: snapshotTimeline(live.raw),
    })

    live.facade.play()
    vi.advanceTimersByTime(1000)
    // Opening a modal, loading a flame and starting an export all pause the
    // raw timeline, not the recorder-aware one.
    live.raw.pause()
    const pausedAt = live.raw.currentFrame()
    // A pause with nothing playing changes nothing, so it is not a step.
    live.raw.pause()
    const session = stopOrThrow()
    stopLive()

    expect(session.unnamedWriteCount).toBe(0)
    expect(steps(session)).toEqual([
      ['timeline.setPlaying', true, 0],
      ['timeline.setPlaying', false, pausedAt, pausedAt],
    ])
  })

  it('leaves the playback of the seat an Arcade agent drives out of its take', () => {
    vi.useFakeTimers()
    const live = makeTimelineWorld()
    configure(live, { startFrame: 0, endFrame: 600, loop: true })
    const stopLive = driveRenderLoop(live.facade)
    startPilot({
      mode: 'cinema',
      title: 'Cinema',
      stepBudget: 40,
      allowed: ['timeline.'],
      qualityRankAtStart: 0,
    })
    startSessionRecording(live.flame, {
      timeline: snapshotTimeline(live.raw),
    })

    live.facade.togglePlay()
    vi.advanceTimersByTime(1000)
    live.facade.togglePlay()
    const session = stopOrThrow()
    stopLive()

    // The tool's own preview: a replay applies the keyframes and leaves Play
    // to the viewer, so the take neither records it nor flags it.
    expect(session.actions).toEqual([])
    expect(session.unnamedWriteCount).toBe(0)
  })
})
