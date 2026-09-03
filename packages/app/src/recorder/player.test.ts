import '@/commands/builtins'
import { createRoot, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import { createSessionPlayer, MAX_STEP_GAP_MS, MIN_STEP_GAP_MS, NARRATION_MAX_HOLD_MS, NARRATION_MIN_HOLD_MS, NARRATION_MS_PER_WORD, stepGapMs, } from './player'
import { cancelSessionRecording, recordSyntheticAction, startSessionRecording, stopSessionRecording, } from './recorder'
import { SESSION_FORMAT_VERSION } from './schema'
import { createRecorderAwareTimeline } from './timelineActions'
import type { RecordedAction, RecordedSession } from './schema'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineSnapshot } from '@/flame/schema/timeline'
import type { HistoryPreviewOwner } from '@/utils/createStoreHistory'

/**
 * The replay transport (semantic-recorder-plan, M4). Two properties matter
 * beyond "it applies the actions": a run collapses into ONE undo step, so
 * watching a session does not bury the viewer's own history; and seeking
 * backwards rebuilds from the initial flame rather than trying to undo.
 */

function makeSession(actions: RecordedAction[]): RecordedSession {
  return {
    version: SESSION_FORMAT_VERSION,
    app: { version: 'test', flameSchemaVersion: '1.0' },
    createdAt: new Date(0).toISOString(),
    initial: deepClone(examples.example1),
    actions,
    unnamedWriteCount: 0,
  }
}

const gammaSteps = makeSession([
  { t: 0, id: 'flame.setGamma', args: [1.5], label: 'Set Gamma' },
  { t: 100, id: 'flame.setGamma', args: [2.5], label: 'Set Gamma' },
  { t: 250, id: 'flame.setGamma', args: [3.5], label: 'Set Gamma' },
])

/** A workspace-shaped target: the real history, so batching is exercised. */
function makeTarget(start: FlameDescriptor) {
  const [flame, setFlameDescriptor, history] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(start)),
    { journal: true },
  )
  const [zoom, setZoom] = createSignal(1)
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const ctx = {
    beforeCommand: () => {
      history.takeOverOwnedPreview()
    },
    flameDescriptor: () => flame,
    setFlameDescriptor,
    zoom,
    setZoom,
    pixelRatio,
    setPixelRatio,
  } as unknown as CommandContext
  let entries = 0
  let loads = 0
  let replayOwner: HistoryPreviewOwner | undefined
  const target = {
    loadInitial: (next: FlameDescriptor) => {
      loads++
      // Through the SETTER, not history.replace: replace pushes its own entry
      // and would escape the batch the player opened.
      setFlameDescriptor(() => deepClone(next), 'Replay: initial state')
    },
    execute: (id: string, args: unknown[]) => {
      return executeReplayCommand(id, ctx, ...args)
    },
    beginBatch: (onTakeover: () => void) => {
      replayOwner = history.startOwnedPreview('Replay', onTakeover)
    },
    withBatchWrite: <R>(fn: () => R): R => {
      const owner = replayOwner
      if (owner === undefined) return fn()
      return history.withPreviewOwner(owner, fn)
    },
    endBatch: () => {
      const owner = replayOwner
      replayOwner = undefined
      if (owner !== undefined && history.commitOwnedPreview(owner)) {
        entries++
      }
    },
  }
  return {
    flame,
    history,
    ctx,
    target,
    committed: () => entries,
    loaded: () => loads,
    pixelRatio,
  }
}

/** Production-shaped replay target for timeline write-through atomicity. */
function makeTimelineTarget(start: FlameDescriptor) {
  const [flame, setFlameDescriptor, history] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(start)),
  )
  const timeline = createTimelineState()
  timeline.setValueWriter((path, value) => {
    if (path !== 'gamma' || typeof value !== 'number') return
    // This is the same ownership split as MainWorkspace's timeline writer:
    // current-frame values intentionally bypass flame patches.
    history.setSilently((draft) => {
      draft.renderSettings.gamma = value
    })
  })
  const ctx = {
    beforeCommand: () => {
      history.takeOverOwnedPreview()
    },
    flameDescriptor: () => flame,
    setFlameDescriptor,
    timeline: {
      currentFrame: timeline.currentFrame,
      setCurrentFrame: timeline.setCurrentFrame,
      edit: {
        setKeyframeValue: timeline.setKeyframeValue,
      },
    },
  } as unknown as CommandContext

  type ReplaySnapshot = {
    flame: FlameDescriptor
    timeline: TimelineSnapshot
  }
  const snapshot = (): ReplaySnapshot => ({
    flame: deepClone(flame),
    timeline: {
      config: deepClone(timeline.config()),
      currentFrame: timeline.currentFrame(),
      animationEnabled: timeline.animationEnabled(),
      autoKeyframe: timeline.autoKeyframe(),
      previewHeld: timeline.previewHeld(),
      tracks: deepClone(timeline.tracks()),
    },
  })
  const restore = (state: ReplaySnapshot) => {
    timeline.setTracks(() => deepClone(state.timeline.tracks))
    timeline.setConfig(deepClone(state.timeline.config))
    timeline.setCurrentFrame(state.timeline.currentFrame ?? 0)
    history.replaceSilently(state.flame)
  }

  let owner: HistoryPreviewOwner | undefined
  let before: ReplaySnapshot | undefined
  const target = {
    loadInitial: (next: FlameDescriptor) => {
      setFlameDescriptor(() => deepClone(next), 'Replay: initial state')
    },
    loadTimeline: (state: TimelineSnapshot) => {
      timeline.loadTracks(state.tracks)
      timeline.setConfig(state.config)
      timeline.setCurrentFrame(state.currentFrame ?? 0)
    },
    execute: (id: string, args: unknown[]) =>
      executeReplayCommand(id, ctx, ...args),
    beginBatch: (onTakeover: () => void) => {
      before = snapshot()
      timeline.beginTransientHistory()
      owner = history.startOwnedPreview('Replay', onTakeover)
    },
    withBatchWrite: <R>(fn: () => R): R => {
      if (owner === undefined) return fn()
      return history.withPreviewOwner(owner, fn)
    },
    endBatch: () => {
      const batchOwner = owner
      const batchBefore = before
      const after = snapshot()
      owner = undefined
      before = undefined
      timeline.endTransientHistory()
      if (batchOwner === undefined || batchBefore === undefined) return
      history.commitOwnedPreview(batchOwner, {
        force: JSON.stringify(batchBefore) !== JSON.stringify(after),
        undoEffect: () => {
          restore(batchBefore)
        },
        redoEffect: () => {
          restore(after)
        },
      })
    },
  }
  return { flame, history, timeline, target, snapshot }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cancelSessionRecording()
  vi.useRealTimers()
})

function at(t: number, extra: Partial<RecordedAction> = {}): RecordedAction {
  return { t, id: 'flame.setGamma', args: [1], ...extra }
}

/**
 * The pacing rule, which the live player and the video exporter share.
 *
 * These are the numbers a Teach replay lives or dies by: an agent issues its
 * edits milliseconds apart and thinks for seconds between them, so the raw
 * recording is a burst nobody can watch punctuated by pauses charged to the
 * wrong step.
 */
describe('stepGapMs', () => {
  it('floors a machine-speed burst so each step can be seen', () => {
    // Six steps inside 26ms is a real measurement, not a hypothetical.
    expect(stepGapMs(at(353851), at(353852), 1)).toBe(MIN_STEP_GAP_MS)
    expect(stepGapMs(at(353843), at(353848), 1)).toBe(MIN_STEP_GAP_MS)
  })

  it('leaves a human-paced gap alone', () => {
    expect(stepGapMs(at(0), at(600), 1)).toBe(600)
    expect(stepGapMs(at(0), at(1000), 1)).toBe(1000)
  })

  it('still clamps a long thinking pause', () => {
    expect(stepGapMs(at(0), at(15_670), 1)).toBe(MAX_STEP_GAP_MS)
  })

  it('floors the recording, not the playback, so speed keeps working', () => {
    // Flooring after the division would pin every step of an agent take to
    // MIN_STEP_GAP_MS at every speed, and the 4x button would do nothing on
    // exactly the takes that need it.
    expect(stepGapMs(at(0), at(1), 4)).toBe(MIN_STEP_GAP_MS / 4)
    expect(stepGapMs(at(0), at(1), 2)).toBe(MIN_STEP_GAP_MS / 2)
  })

  it('does not floor the lead-in before the first step', () => {
    expect(stepGapMs(undefined, at(12), 1)).toBe(12)
    expect(stepGapMs(undefined, at(0), 1)).toBe(0)
  })

  it('does not pull a companion pair apart', () => {
    // Two commands sharing a timestamp are one gesture; the video scheduler
    // says so in as many words, and a floor between them would stage a single
    // user action as two.
    expect(stepGapMs(at(500), at(500), 1)).toBe(0)
  })

  it('lets an authored hold win, unclamped in both directions', () => {
    expect(stepGapMs(at(0, { holdMs: 0 }), at(1), 1)).toBe(0)
    expect(stepGapMs(at(0, { holdMs: 9000 }), at(1), 1)).toBe(9000)
    expect(stepGapMs(at(0, { holdMs: 9000 }), at(1), 2)).toBe(4500)
  })

  it('holds a narration step long enough to read it', () => {
    // The bug this exists for: six sentences shared 10.3ms of screen time
    // because the pause the agent spent writing them was charged to the edit
    // BEFORE each one.
    const note = at(0, { id: 'lesson.note', args: ['one two three four five'] })
    expect(stepGapMs(note, at(2), 1)).toBe(5 * NARRATION_MS_PER_WORD)
    expect(stepGapMs(note, at(2), 1)).toBeGreaterThan(MAX_STEP_GAP_MS)
  })

  it('bounds a narration hold at both ends', () => {
    const terse = at(0, { id: 'lesson.note', args: ['go'] })
    expect(stepGapMs(terse, at(2), 1)).toBe(NARRATION_MIN_HOLD_MS)
    const essay = at(0, {
      id: 'lesson.note',
      args: [Array.from({ length: 200 }, () => 'word').join(' ')],
    })
    expect(stepGapMs(essay, at(2), 1)).toBe(NARRATION_MAX_HOLD_MS)
  })

  it('reads a sentence that rode along as a caption', () => {
    // With narrationAsStep off there is no lesson.note action at all: the
    // sentence captions the step it introduces. Same prose, same pacing.
    const captioned = at(0, { note: 'one two three four five' })
    expect(stepGapMs(captioned, at(2), 1)).toBe(5 * NARRATION_MS_PER_WORD)
  })

  it('ignores an empty sentence', () => {
    expect(stepGapMs(at(0, { note: '   ' }), at(2), 1)).toBe(MIN_STEP_GAP_MS)
    expect(stepGapMs(at(0, { id: 'lesson.note', args: [] }), at(2), 1)).toBe(
      MIN_STEP_GAP_MS,
    )
  })
})

describe('createSessionPlayer', () => {
  it('clears transient UI before opening the replay batch and loading the baseline', () => {
    createRoot((dispose) => {
      const events: string[] = []
      const player = createSessionPlayer(gammaSteps, {
        prepare: () => events.push('prepare'),
        beginBatch: () => events.push('begin'),
        loadInitial: () => events.push('load'),
        execute: () => {
          events.push('execute')
          return true
        },
        endBatch: () => events.push('end'),
      })

      player.seek(0)

      expect(events).toEqual(['prepare', 'begin', 'load', 'execute', 'end'])
      dispose()
    })
  })

  it('defers target side effects across an entire seek rebuild', () => {
    createRoot((dispose) => {
      const events: string[] = []
      const player = createSessionPlayer(gammaSteps, {
        loadInitial: () => events.push('load'),
        execute: () => {
          events.push('execute')
          return true
        },
        withDeferredEffects: (run) => {
          events.push('defer:start')
          try {
            return run()
          } finally {
            events.push('defer:end')
          }
        },
      })

      player.seek(2)

      expect(events).toEqual([
        'defer:start',
        'load',
        'execute',
        'execute',
        'execute',
        'defer:end',
      ])
      dispose()
    })
  })

  it('prepares the matching UI before executing each replay action', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const events: string[] = []
      const execute = target.execute
      const player = createSessionPlayer(
        gammaSteps,
        {
          ...target,
          execute: (id, args) => {
            events.push(`execute:${id}`)
            execute(id, args)
            return true
          },
        },
        {
          beforeAction: (action) => {
            events.push(`prepare:${action.id}`)
          },
        },
      )

      player.seek(0)

      expect(events).toEqual([
        'prepare:flame.setGamma',
        'execute:flame.setGamma',
      ])
      dispose()
    })
  })

  it('plays through every step, paced by the recorded gaps', () => {
    createRoot((dispose) => {
      const { flame, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.play()

      // The first step waits out its own offset from the session start, which
      // is a lead-in rather than a dwell on anything, so no floor applies.
      vi.advanceTimersByTime(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      expect(player.stepIndex()).toBe(0)

      // The recorded 100ms and 150ms gaps are below MIN_STEP_GAP_MS: nobody
      // can watch a step that lasts a tenth of a second, so both are floored.
      vi.advanceTimersByTime(MIN_STEP_GAP_MS - 1)
      expect(player.stepIndex()).toBe(0)
      vi.advanceTimersByTime(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)

      vi.advanceTimersByTime(MIN_STEP_GAP_MS)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      expect(player.isPlaying()).toBe(false)
      dispose()
    })
  })

  it('primes gated effects inside Play before the first timer task', () => {
    createRoot((dispose) => {
      const events: string[] = []
      const player = createSessionPlayer(gammaSteps, {
        loadInitial: () => events.push('load'),
        primeEffects: () => events.push('prime'),
        execute: () => {
          events.push('execute')
          return true
        },
      })

      player.play()
      expect(events).toEqual(['load', 'prime'])
      vi.advanceTimersByTime(0)
      expect(events).toEqual(['load', 'prime', 'execute'])
      dispose()
    })
  })

  it('starts from the flame the session was recorded against', () => {
    createRoot((dispose) => {
      // The target holds a different flame from the session's `initial` — the
      // ordinary case: the viewer was editing something when they hit Play.
      const { flame, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.play()
      vi.advanceTimersByTime(0)

      // Everything the session did not touch comes from `initial`, not from
      // what happened to be on screen. Replaying onto the viewer's own flame
      // would produce a hybrid that matches neither.
      expect(flame.transforms).toEqual(examples.example1.transforms)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      dispose()
    })
  })

  it('collapses a whole run into one undo step', () => {
    createRoot((dispose) => {
      const { flame, history, target, committed } = makeTarget(
        examples.initExample,
      )
      const before = deepClone(flame)
      const player = createSessionPlayer(gammaSteps, target)
      player.play()
      vi.advanceTimersByTime(1000)

      expect(committed()).toBe(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      // One undo takes the viewer back to their own flame — the whole point
      // of batching, and what makes "watch it, then carry on" usable.
      history.undo()
      expect(deepClone(flame)).toEqual(before)
      dispose()
    })
  })

  it('applies a speed change from the next step onward', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const [speed, setSpeed] = createSignal(1)
      const player = createSessionPlayer(gammaSteps, target, { speed })
      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)

      // The wait for step 1 is already scheduled at the old speed, so the
      // change lands on the step after it — never more than one gap late,
      // which MAX_STEP_GAP_MS bounds.
      setSpeed(10)
      vi.advanceTimersByTime(MIN_STEP_GAP_MS)
      expect(player.stepIndex()).toBe(1)

      // Step 2's gap is floored to MIN_STEP_GAP_MS as a RECORDED gap, then
      // divided: 50ms, not 500. The floor repairs the recording; it does not
      // pin playback, or the speed control would do nothing on an agent take,
      // where every measured gap is under the floor.
      vi.advanceTimersByTime(MIN_STEP_GAP_MS / 10 - 1)
      expect(player.stepIndex()).toBe(1)
      vi.advanceTimersByTime(1)
      expect(player.stepIndex()).toBe(2)
      dispose()
    })
  })

  it('clamps a long thinking pause so playback never stalls', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const longPause = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 5 * 60_000, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(longPause, target)
      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)
      vi.advanceTimersByTime(MAX_STEP_GAP_MS)
      expect(player.stepIndex()).toBe(1)
      dispose()
    })
  })

  it('pause stops the clock and commits what was applied', () => {
    createRoot((dispose) => {
      const { flame, target, committed } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.play()
      vi.advanceTimersByTime(0)
      player.pause()

      expect(committed()).toBe(1)
      expect(player.currentAction()?.args).toEqual([1.5])
      vi.advanceTimersByTime(10_000)
      expect(player.stepIndex()).toBe(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      dispose()
    })
  })

  it('resumes a paused prefix without reloading when no live edit occurred', () => {
    createRoot((dispose) => {
      const { flame, target, loaded } = makeTarget(examples.initExample)
      const twoSteps = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(twoSteps, target)

      player.play()
      vi.advanceTimersByTime(0)
      player.pause()
      expect(loaded()).toBe(1)

      player.play()
      expect(loaded()).toBe(1)
      expect(player.stepIndex()).toBe(0)
      vi.advanceTimersByTime(MIN_STEP_GAP_MS)
      expect(player.stepIndex()).toBe(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)
      dispose()
    })
  })

  it('rebuilds a paused prefix after a live command edits the workspace', () => {
    createRoot((dispose) => {
      const { flame, ctx, target, loaded } = makeTarget(examples.initExample)
      const twoSteps = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(twoSteps, target)

      player.play()
      vi.advanceTimersByTime(0)
      player.pause()
      executeCommand('flame.setGamma', ctx, 9)
      expect(flame.renderSettings.gamma).toBeCloseTo(9, 5)

      player.play()
      expect(loaded()).toBe(2)
      expect(player.stepIndex()).toBe(-1)
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      vi.advanceTimersByTime(MIN_STEP_GAP_MS)
      expect(player.stepIndex()).toBe(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)
      dispose()
    })
  })

  it('hands an in-flight replay to a manual preview before the gesture writes', () => {
    createRoot((dispose) => {
      const { flame, history, ctx, target } = makeTarget(examples.initExample)
      const before = deepClone(flame)
      const twoSteps = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(twoSteps, target)

      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)
      expect(player.isPlaying()).toBe(true)
      expect(history.hasOpenPreview()).toBe(true)
      expect(history.isPreviewing()).toBe(false)

      // Starting a real editor gesture takes ownership synchronously: replay
      // pauses and commits its prefix before this preview is opened.
      if (!history.isPreviewing()) history.startPreview('Manual gamma scrub')
      expect(player.isPlaying()).toBe(false)
      expect(player.currentAction()).toBeUndefined()
      executeCommand('flame.setGamma', ctx, 7)
      executeCommand('flame.setGamma', ctx, 8)
      executeCommand('flame.setGamma', ctx, 9)
      history.commit()

      // The pending replay timer was cancelled; step 2 can neither overwrite
      // the manual value nor append itself to the user's preview.
      vi.advanceTimersByTime(10_000)
      expect(player.stepIndex()).toBe(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(9, 5)

      // The gesture and replay prefix remain two coherent undo steps.
      history.undo()
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      history.undo()
      expect(deepClone(flame)).toEqual(before)
      dispose()
    })
  })

  it('rebuilds from the recorded baseline after a user takeover before resuming', () => {
    createRoot((dispose) => {
      const { flame, history, ctx, target, loaded } = makeTarget(
        examples.initExample,
      )
      const twoSteps = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(twoSteps, target)

      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)
      expect(loaded()).toBe(1)

      if (!history.isPreviewing()) history.startPreview('Manual gamma scrub')
      executeCommand('flame.setGamma', ctx, 9)
      history.commit()
      expect(player.isPlaying()).toBe(false)
      expect(flame.renderSettings.gamma).toBeCloseTo(9, 5)

      player.play()
      expect(loaded()).toBe(2)
      expect(player.stepIndex()).toBe(-1)
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      vi.advanceTimersByTime(MIN_STEP_GAP_MS)
      expect(player.stepIndex()).toBe(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)
      dispose()
    })
  })

  it('hands replay over before a live view-only command runs', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const twoSteps = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(twoSteps, world.target)

      player.play()
      vi.advanceTimersByTime(0)
      executeCommand('view.setPixelRatio', world.ctx, 0.5)

      expect(player.isPlaying()).toBe(false)
      expect(player.stepIndex()).toBe(0)
      expect(world.committed()).toBe(1)
      expect(world.history.hasOpenPreview()).toBe(false)
      expect(world.pixelRatio()).toBe(0.5)
      vi.advanceTimersByTime(10_000)
      expect(world.flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      expect(world.pixelRatio()).toBe(0.5)
      dispose()
    })
  })

  it('hands replay over before a live timeline-only command runs', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const [duration, setDuration] = createSignal(120)
      Object.assign(world.ctx, {
        timeline: {
          duration,
          setDuration: (value: number) => {
            setDuration(value)
          },
        },
      })
      const twoSteps = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(twoSteps, world.target)

      player.play()
      vi.advanceTimersByTime(0)
      executeCommand('timeline.setDuration', world.ctx, 240)

      expect(player.isPlaying()).toBe(false)
      expect(player.stepIndex()).toBe(0)
      expect(world.committed()).toBe(1)
      expect(world.history.hasOpenPreview()).toBe(false)
      expect(duration()).toBe(240)
      vi.advanceTimersByTime(10_000)
      expect(world.flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      expect(duration()).toBe(240)
      dispose()
    })
  })

  it('hands replay over before wall-clock timeline playback starts', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const raw = createTimelineState()
      raw.setAnimationEnabled(true)
      const timeline = createRecorderAwareTimeline(
        raw,
        () => {
          throw new Error('wall-clock transport is not a replay command')
        },
        () => {
          world.history.takeOverOwnedPreview()
        },
      )
      const twoSteps = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5] },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(twoSteps, world.target)

      player.play()
      vi.advanceTimersByTime(0)
      timeline.togglePlay()

      expect(player.isPlaying()).toBe(false)
      expect(player.stepIndex()).toBe(0)
      expect(world.committed()).toBe(1)
      expect(world.history.hasOpenPreview()).toBe(false)
      expect(raw.isPlaying()).toBe(true)

      vi.advanceTimersByTime(10_000)
      expect(player.stepIndex()).toBe(0)
      expect(world.flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      dispose()
    })
  })

  it('seeks backwards by rebuilding from the initial flame', () => {
    createRoot((dispose) => {
      const { flame, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.seek(2)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)

      // Backwards is a replay of the prefix, not an undo of the difference.
      player.seek(0)
      expect(flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      expect(player.stepIndex()).toBe(0)

      // -1 is the untouched initial document.
      player.seek(-1)
      expect(deepClone(flame)).toEqual(deepClone(examples.example1))
      expect(player.stepIndex()).toBe(-1)
      dispose()
    })
  })

  it('silently rebuilds a seek prefix and prepares only the destination', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const execute = world.target.execute
      const executed: number[] = []
      const prepared: number[] = []
      const leakedActions: number[] = []
      const player = createSessionPlayer(
        gammaSteps,
        {
          ...world.target,
          execute: (id, args) => {
            executed.push(args[0] as number)

            // Replay execution is invisible to the recorder, including the
            // prefix that is rebuilt without publishing intermediate steps.
            expect(startSessionRecording(examples.example1).ok).toBe(true)
            recordSyntheticAction(id, args)
            leakedActions.push(stopSessionRecording()?.actions.length ?? -1)

            execute(id, args)
            return true
          },
        },
        {
          beforeAction: (action) => {
            prepared.push(action.args[0] as number)
          },
        },
      )

      player.seek(2)

      expect(executed).toEqual([1.5, 2.5, 3.5])
      expect(prepared).toEqual([3.5])
      expect(leakedActions).toEqual([0, 0, 0])
      expect(player.stepIndex()).toBe(2)
      expect(world.flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      dispose()
    })
  })

  it('reports the exact failed prefix step and publishes the rebuilt state', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const execute = world.target.execute
      const prepared: number[] = []
      const player = createSessionPlayer(
        gammaSteps,
        {
          ...world.target,
          execute: (id, args) => {
            if (args[0] === 2.5) return false
            execute(id, args)
            return true
          },
        },
        {
          beforeAction: (action) => {
            prepared.push(action.args[0] as number)
          },
        },
      )

      player.seek(2)

      expect(player.lastError()).toContain('Step 2')
      expect(player.stepIndex()).toBe(0)
      expect(world.flame.renderSettings.gamma).toBeCloseTo(1.5, 5)
      expect(world.history.hasOpenPreview()).toBe(false)
      expect(prepared).toEqual([])
      dispose()
    })
  })

  it('seeks forwards by applying only the missing steps', () => {
    createRoot((dispose) => {
      const { flame, ctx, target, loaded } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)

      // The first move loads the recorded flame, whichever direction it is.
      // After that, stepping forward one at a time — the common case, from the
      // ▶| button and from clicking down the step list — applies only the
      // missing actions: rebuilding from `initial` each time would make that
      // quadratic and flicker the whole document once per step.
      player.seek(0)
      expect(loaded()).toBe(1)
      player.seek(1)
      player.seek(2)
      expect(loaded()).toBe(1)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)

      // Re-seeking the step we are on still rebuilds — that is how the viewer
      // discards edits of their own and gets the recorded state back.
      executeCommand('flame.setGamma', ctx, 9)
      player.seek(2)
      expect(loaded()).toBe(2)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      dispose()
    })
  })

  it('a seek is its own single undo step', () => {
    createRoot((dispose) => {
      const { target, committed } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.seek(2)
      expect(committed()).toBe(1)
      player.seek(0)
      expect(committed()).toBe(2)
      dispose()
    })
  })

  it('undoes a forward replay batch that wrote the flame through timeline setSilently', () => {
    createRoot((dispose) => {
      const initial = deepClone(examples.example1)
      initial.renderSettings.gamma = 1
      const world = makeTimelineTarget(initial)
      const initialTimeline = world.snapshot().timeline
      initialTimeline.currentFrame = 0
      initialTimeline.tracks = [
        {
          parameterPath: 'gamma',
          keyframes: [{ frame: 0, value: 1 }],
        },
      ]
      const session: RecordedSession = {
        ...makeSession([
          { t: 0, id: 'timeline.setCurrentFrame', args: [0] },
          {
            t: 100,
            id: 'timeline.setKeyframeValue',
            args: ['gamma', 0, 2],
          },
        ]),
        initial: deepClone(initial),
        initialTimeline,
      }
      const player = createSessionPlayer(session, world.target)

      // First seek commits the loaded baseline. The second is forward-only,
      // so it has no root replacement patch to incidentally cover the silent
      // current-frame write.
      player.seek(0)
      expect(world.flame.renderSettings.gamma).toBe(1)
      player.seek(1)
      expect(world.flame.renderSettings.gamma).toBe(2)
      expect(world.timeline.tracks()[0]?.keyframes[0]?.value).toBe(2)

      world.history.undo()
      expect(world.flame.renderSettings.gamma).toBe(1)
      expect(world.timeline.tracks()[0]?.keyframes[0]?.value).toBe(1)
      world.history.redo()
      expect(world.flame.renderSettings.gamma).toBe(2)
      expect(world.timeline.tracks()[0]?.keyframes[0]?.value).toBe(2)
      dispose()
    })
  })

  it('replaying past the end starts over rather than sitting dead', () => {
    createRoot((dispose) => {
      const { flame, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.seek(2)
      player.play()
      // Rewound to the initial flame, then plays forward again.
      expect(player.stepIndex()).toBe(-1)
      vi.advanceTimersByTime(1000)
      expect(player.stepIndex()).toBe(2)
      expect(flame.renderSettings.gamma).toBeCloseTo(3.5, 5)
      dispose()
    })
  })

  it('leaves the document editable after stopping (fork from a step)', () => {
    createRoot((dispose) => {
      const { flame, history, ctx, target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      player.seek(1)
      player.stop()

      // No preview left open, so ordinary editing and undo work again.
      expect(history.hasOpenPreview()).toBe(false)
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)

      // Carry on from step 1 with an edit of the viewer's own...
      executeCommand('flame.setGamma', ctx, 9)
      expect(flame.renderSettings.gamma).toBeCloseTo(9, 5)

      // ...which is its own undo step, on top of the replayed one.
      history.undo()
      expect(flame.renderSettings.gamma).toBeCloseTo(2.5, 5)
      history.undo()
      expect(deepClone(flame)).toEqual(deepClone(examples.initExample))
      dispose()
    })
  })

  it('stops and closes the undo batch when an action is rejected', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const execute = world.target.execute
      let calls = 0
      const target = {
        ...world.target,
        execute: (id: string, args: unknown[]) => {
          calls++
          if (calls === 2) return false
          execute(id, args)
        },
      }
      const player = createSessionPlayer(gammaSteps, target)

      player.play()
      vi.advanceTimersByTime(1000)

      expect(player.isPlaying()).toBe(false)
      expect(player.stepIndex()).toBe(0)
      expect(player.lastError()).toContain('Step 2')
      expect(world.history.hasOpenPreview()).toBe(false)
      dispose()
    })
  })

  it('does not touch the target while a recording is active', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      startSessionRecording(examples.example1)
      const player = createSessionPlayer(gammaSteps, world.target)

      player.play()
      player.seek(1)

      expect(world.loaded()).toBe(0)
      expect(world.history.hasOpenPreview()).toBe(false)
      expect(player.lastError()).toContain('Stop the active recording')
      dispose()
    })
  })

  it('aborts safely if a recording starts between timed replay steps', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, world.target)

      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)

      startSessionRecording(world.flame)
      vi.advanceTimersByTime(MIN_STEP_GAP_MS)

      expect(player.isPlaying()).toBe(false)
      expect(player.stepIndex()).toBe(0)
      expect(player.lastError()).toContain('Stop the active recording')
      expect(world.history.hasOpenPreview()).toBe(false)
      dispose()
    })
  })

  it('closes an open replay batch when a recording blocks a seek', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, world.target)

      player.play()
      vi.advanceTimersByTime(0)
      expect(world.history.hasOpenPreview()).toBe(true)
      expect(world.history.isPreviewing()).toBe(false)
      expect(player.stepIndex()).toBe(0)

      startSessionRecording(world.flame)
      player.seek(2)

      expect(player.isPlaying()).toBe(false)
      expect(player.stepIndex()).toBe(0)
      expect(player.lastError()).toContain('Stop the active recording')
      expect(world.history.hasOpenPreview()).toBe(false)

      vi.advanceTimersByTime(10_000)
      expect(player.stepIndex()).toBe(0)
      dispose()
    })
  })

  it('preflights every action before opening a batch or loading state', () => {
    createRoot((dispose) => {
      const world = makeTarget(examples.initExample)
      const target = {
        ...world.target,
        preflight: (_id: string, args: readonly unknown[]) =>
          args[0] === 2.5 ? 'test rejection' : undefined,
      }
      const player = createSessionPlayer(gammaSteps, target)

      player.seek(2)

      expect(world.loaded()).toBe(0)
      expect(world.history.hasOpenPreview()).toBe(false)
      expect(world.committed()).toBe(0)
      expect(player.stepIndex()).toBe(-1)
      expect(player.lastError()).toContain('Step 2: test rejection')
      dispose()
    })
  })
})

describe('authored pacing', () => {
  it('holds a step for its authored holdMs instead of the recorded gap', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      // Recorded 100ms apart, but the author wants to sit on step 0.
      const authored = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5], holdMs: 3000 },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(authored, target)
      player.play()
      vi.advanceTimersByTime(0)
      expect(player.stepIndex()).toBe(0)

      // The recorded gap would have advanced here; the authored hold does not.
      vi.advanceTimersByTime(2999)
      expect(player.stepIndex()).toBe(0)
      vi.advanceTimersByTime(1)
      expect(player.stepIndex()).toBe(1)
      dispose()
    })
  })

  it('scales an authored hold with playback speed', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const [speed] = createSignal(4)
      const authored = makeSession([
        { t: 0, id: 'flame.setGamma', args: [1.5], holdMs: 2000 },
        { t: 100, id: 'flame.setGamma', args: [2.5] },
      ])
      const player = createSessionPlayer(authored, target, { speed })
      player.play()
      vi.advanceTimersByTime(0)
      vi.advanceTimersByTime(500)
      expect(player.stepIndex()).toBe(1)
      dispose()
    })
  })

  it('exposes the current action so the follow-cam knows where to point', () => {
    createRoot((dispose) => {
      const { target } = makeTarget(examples.initExample)
      const player = createSessionPlayer(gammaSteps, target)
      expect(player.currentAction()).toBeUndefined()
      player.seek(1)
      expect(player.currentAction()?.args).toEqual([2.5])
      dispose()
    })
  })
})
