import '@/commands/builtins'
import { createRoot, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import { cancelSessionRecording, reportDocumentWrite, startSessionRecording, stopSessionRecording, withRecordingSuppressed, } from './recorder'
import { snapshotOrigin } from './snapshotOrigin'
import { createRecorderAwareTimeline, runTimelineSnapshotMutation, snapshotTimeline, } from './timelineActions'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'

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
    arena: {} as any,
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
