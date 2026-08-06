// Ensure the vocabulary is registered: the registry is a module-global Map
// and an unregistered id is a silent no-op (same reasoning as portalScript).
import '@/commands/builtins'
import { createRoot, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { cancelSessionRecording, recordedActionCount, reportDocumentWrite, startSessionRecording, stopSessionRecording, unnamedWriteCount, withRecordingSuppressed, } from './recorder'
import { replaySessionInstant } from './replay'
import { parseSession, serializeSession, sessionFilename } from './schema'
import type { RecordedSession } from './schema'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

/**
 * The recorder's core claim (docs/plans/semantic-recorder-plan.md): a session
 * recorded through the command registry replays into the same document, and
 * every write that WOULD break that claim is counted, not silently dropped.
 * Tested headlessly against the same history-backed setter the workspace
 * uses, so command → history attribution is exercised for real.
 */

/**
 * A workspace-shaped world for commands: the app's real `createStoreHistory`
 * setter (so history entries, previews, and the recorder's coverage hook all
 * behave exactly as in MainWorkspace) surrounded by portalScript-style inert
 * stand-ins. `ctx.history` is the real undo/redo of this private history —
 * there is no timeline stack here, so no router is needed.
 */
function makeHeadlessWorld(start: FlameDescriptor) {
  const [flame, setFlameDescriptor, history] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(start)),
    // Journaled like MainWorkspace's: the recorder reads journal stamps to
    // tell in-session edits from ones predating the recording, so an
    // unjournaled history here would not exercise that rule at all.
    { journal: true, onEntryPushed: reportDocumentWrite },
  )
  const [zoom, setZoom] = createSignal(1)
  const [position, setPosition] = createSignal(vec2f(0, 0))
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [animationEnabled, setAnimationEnabled] = createSignal(false)
  const [tracks, setTracks] = createSignal<TimelineTrack[]>([])
  const [duration, setDuration] = createSignal(0)
  const [currentFrame, setCurrentFrame] = createSignal(0)
  const [blendFlame, setBlendFlame] = createSignal<FlameDescriptor>()
  const [blendWeight, setBlendWeight] = createSignal(0)

  const ctx: CommandContext = {
    flameDescriptor: () => flame,
    setFlameDescriptor,
    blendFlame,
    setBlendFlame: (next) => {
      setBlendFlame(() => next)
    },
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
      tracks,
      setTracks,
      animationEnabled,
      setAnimationEnabled,
      duration,
      setDuration,
      currentFrame,
      setCurrentFrame,
      play: () => {},
      setLoop: () => {},
      setFps: () => {},
      addKeyframe: () => {},
    },
    camera: {
      center: () => {
        setZoom(1)
        setPosition(vec2f(0, 0))
      },
    },
    modal: { open: () => {} },
    // No timeline stack here, so the peeks report this history directly —
    // the router's own arbitration is covered in undoRouting.test.ts.
    history: {
      undo: history.undo,
      redo: history.redo,
      peekUndoTarget: () =>
        history.hasUndo()
          ? { system: 'flame', seq: history.peekUndoSeq() }
          : undefined,
      peekRedoTarget: () =>
        history.hasRedo()
          ? { system: 'flame', seq: history.peekRedoSeq() }
          : undefined,
    },
  }
  return { flame, setFlameDescriptor, history, ctx }
}

/** Replay into a world the way MainWorkspace will: history.replace for the
 *  initial document, the registry for every action. */
function replayIntoWorld(
  session: RecordedSession,
  world: ReturnType<typeof makeHeadlessWorld>,
) {
  replaySessionInstant(session, {
    loadInitial: (f) => {
      world.history.replace(f, 'Replay: initial state')
    },
    execute: (id, args) => {
      executeCommand(id, world.ctx, ...args)
    },
  })
}

function stopOrThrow(): RecordedSession {
  const session = stopSessionRecording()
  if (!session) throw new Error('no active recording')
  return session
}

afterEach(() => {
  cancelSessionRecording()
})

describe('record → replay round-trip', () => {
  it('replays a deterministic session into the same document', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.setGamma', a.ctx, 3.1)
      executeCommand('flame.setExposure', a.ctx, 0.4)
      executeCommand('flame.setProbability', a.ctx, 0, 0.4)
      executeCommand('flame.setAffine', a.ctx, 0, 'pre', 'a', 0.8)
      executeCommand('flame.setVariationWeight', a.ctx, 0, 0, 0.7)
      executeCommand('flame.setBackgroundColor', a.ctx, 0.1, 0.2, 0.3)
      const session = stopOrThrow()

      expect(session.actions.map((x) => x.id)).toEqual([
        'flame.setGamma',
        'flame.setExposure',
        'flame.setProbability',
        'flame.setAffine',
        'flame.setVariationWeight',
        'flame.setBackgroundColor',
      ])
      // Everything went through the registry: the log is fully replayable.
      expect(session.unnamedWriteCount).toBe(0)
      expect(session.initial).toEqual(deepClone(examples.example1))

      // A different starting flame proves `initial` is what replay loads.
      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('replays id-minting commands identically (ids pre-minted into args)', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.clearTransforms', a.ctx)
      executeCommand('flame.addTransform', a.ctx)
      executeCommand('flame.setProbability', a.ctx, 0, 0.6)
      const session = stopOrThrow()

      // normalizeArgs minted the new TransformId/VariationId at record time,
      // so the log carries them and replay creates the SAME entities.
      const addArgs = session.actions[1]?.args ?? []
      expect(typeof addArgs[0]).toBe('string') // resolved variation type
      expect(typeof addArgs[1]).toBe('string') // pre-minted TransformId
      expect(typeof addArgs[2]).toBe('string') // pre-minted VariationId
      // The index-addressed follow-up was normalized to that same id.
      expect(session.actions[2]?.args[0]).toBe(addArgs[1])

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('normalizes positional refs to stable ids in the recorded args', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const transformIds = Object.keys(a.flame.transforms)
      const secondId = transformIds[1]
      if (secondId === undefined) throw new Error('example1 needs 2 transforms')
      const firstVariationId = Object.keys(
        a.flame.transforms[secondId as keyof typeof a.flame.transforms]!
          .variations,
      )[0]

      startSessionRecording(a.flame)
      executeCommand('flame.setProbability', a.ctx, 1, 0.25)
      executeCommand('flame.setVariationWeight', a.ctx, 1, 0, 0.5)
      const session = stopOrThrow()

      expect(session.actions[0]?.args).toEqual([secondId, 0.25])
      expect(session.actions[1]?.args).toEqual([
        secondId,
        firstVariationId,
        0.5,
      ])
      dispose()
    })
  })

  it('keeps an absent transform ref a no-op across the JSON boundary', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const before = Object.keys(a.flame.transforms)
      startSessionRecording(a.flame)
      executeCommand('flame.removeTransform', a.ctx) // no ref: a no-op
      const session = stopOrThrow()

      expect(Object.keys(a.flame.transforms)).toEqual(before)
      // JSON has no undefined: both deepClone and .steps.json turn the absent
      // ref into null, which must NOT fall through to "index 0" and delete
      // the first transform on replay.
      expect(session.actions[0]?.args).toEqual([null])
      const parsed = parseSession(serializeSession(session))
      if (!parsed) throw new Error('session did not round-trip')

      const b = makeHeadlessWorld(examples.example1)
      replayIntoWorld(parsed, b)
      expect(Object.keys(b.flame.transforms)).toEqual(before)
      dispose()
    })
  })

  it('replays seeded randomize/mutate identically, seed pinned into args', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.randomize', a.ctx)
      executeCommand('flame.mutate', a.ctx, undefined, undefined, {
        mutateAffine: true,
        affineMode: 'smart',
        mutateVariations: 'all',
        mutateColors: true,
        // Force the structural paths: added transforms and topped-up
        // variations mint ids, which the seed must make reproducible.
        addTransformChance: 0.3,
        removeTransformChance: 0.05,
      })
      const session = stopOrThrow()

      // normalizeArgs pinned a concrete seed and the full config, so the log
      // is self-contained even if command defaults change later.
      for (const action of session.actions) {
        expect(typeof action.args[0]).toBe('number')
        expect(action.args[1]).toBeTypeOf('object')
      }
      expect(session.unnamedWriteCount).toBe(0)

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('replays replacement-style commands (reset/loadPreset) for real', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.reset', a.ctx)
      const session = stopOrThrow()

      // Guards against the swallowed-return regression: reset must actually
      // replace the document through the history-backed setter.
      expect(deepClone(a.flame)).toEqual(deepClone(examples.initExample))

      const b = makeHeadlessWorld(examples.example1)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(examples.initExample))
      dispose()
    })
  })

  it('records and replays undo as a command', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const originalGamma = a.flame.renderSettings.gamma
      startSessionRecording(a.flame)
      executeCommand('flame.setGamma', a.ctx, 9)
      executeCommand('history.undo', a.ctx)
      const session = stopOrThrow()

      expect(a.flame.renderSettings.gamma).toBe(originalGamma)
      expect(session.actions.map((x) => x.id)).toEqual([
        'flame.setGamma',
        'history.undo',
      ])
      // Undo/redo move the stacks without pushing entries — they must NOT
      // show up as unnamed writes.
      expect(session.unnamedWriteCount).toBe(0)

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(b.flame.renderSettings.gamma).toBe(originalGamma)
      dispose()
    })
  })
})

describe('undo that reaches outside the recorded session', () => {
  it('flags an undo of an edit made BEFORE recording started', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      // Pre-recording edit: its journal stamp is below the session baseline.
      executeCommand('flame.setGamma', world.ctx, 7)
      startSessionRecording(world.flame)
      executeCommand('history.undo', world.ctx)
      const session = stopOrThrow()

      // The undo still happened — it is just not claimable as replayable, so
      // the action is retracted and the honesty marker rises instead.
      expect(world.flame.renderSettings.gamma).not.toBe(7)
      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(1)
      dispose()
    })
  })

  it('flags an undo routed to the timeline (not part of the document)', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      let undone = false
      const ctx: CommandContext = {
        ...world.ctx,
        history: {
          undo: () => {
            undone = true
          },
          redo: () => {},
          // What the router reports after, say, a keyframe drag.
          peekUndoTarget: () => ({ system: 'timeline', seq: 9999 }),
        },
      }
      startSessionRecording(world.flame)
      executeCommand('history.undo', ctx)
      const session = stopOrThrow()

      expect(undone).toBe(true)
      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(1)
      dispose()
    })
  })

  it('flags an undo with nothing left to revert', () => {
    createRoot((dispose) => {
      // On replay this would undo the replayer's own load of `initial`, so it
      // is not the no-op it looks like.
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      executeCommand('history.undo', world.ctx)
      const session = stopOrThrow()
      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(1)
      dispose()
    })
  })
})

describe('coverage ratchet — unnamed writes', () => {
  it('attributes command writes, counts direct writes as unnamed', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)

      executeCommand('flame.setGamma', world.ctx, 3.3)
      expect(unnamedWriteCount()).toBe(0)

      // A raw setter call — how ~69 MainWorkspace sites still mutate today.
      world.setFlameDescriptor((draft) => {
        draft.renderSettings.exposure = 0.9
      }, 'Some Anonymous Edit')
      expect(unnamedWriteCount()).toBe(1)
      expect(recordedActionCount()).toBe(1)

      const session = stopOrThrow()
      expect(session.unnamedWriteCount).toBe(1)
      dispose()
    })
  })

  it('does not count a no-op write (elided history entries)', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      world.setFlameDescriptor(() => {})
      expect(unnamedWriteCount()).toBe(0)
      dispose()
    })
  })
})

describe('suppression', () => {
  it('ignores commands and writes inside withRecordingSuppressed', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      withRecordingSuppressed(() => {
        executeCommand('flame.setGamma', world.ctx, 4)
        world.setFlameDescriptor((draft) => {
          draft.renderSettings.exposure = 0.7
        })
      })
      const session = stopOrThrow()
      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(0)
      // Suppressed means unrecorded, not undone: the writes happened.
      expect(world.flame.renderSettings.gamma).toBe(4)
      dispose()
    })
  })

  it('does not re-record a replay running during an active recording', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.setGamma', a.ctx, 3.7)
      const session = stopOrThrow()

      const b = makeHeadlessWorld(examples.initExample)
      startSessionRecording(b.flame)
      replayIntoWorld(session, b)
      const second = stopOrThrow()
      expect(second.actions).toEqual([])
      expect(second.unnamedWriteCount).toBe(0)
      expect(b.flame.renderSettings.gamma).toBe(3.7)
      dispose()
    })
  })
})

describe('.steps.json serialization', () => {
  function recordSmallSession(): RecordedSession {
    return createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      executeCommand('flame.setGamma', world.ctx, 2.42)
      executeCommand('flame.setVibrancy', world.ctx, 0.95)
      const session = stopOrThrow()
      dispose()
      return session
    })
  }

  it('round-trips through serialize/parse', () => {
    const session = recordSmallSession()
    const parsed = parseSession(serializeSession(session))
    expect(parsed).toEqual(session)
    // Labels resolved at record time, timestamps monotonic.
    expect(parsed?.actions.map((x) => x.label)).toEqual([
      'Set Gamma',
      'Set Vibrancy',
    ])
    const times = parsed?.actions.map((x) => x.t) ?? []
    expect([...times].sort((x, y) => x - y)).toEqual(times)
  })

  it('rejects malformed payloads', () => {
    const session = recordSmallSession()
    expect(parseSession('not json')).toBeUndefined()
    expect(
      parseSession(serializeSession({ ...session, version: 2 as never })),
    ).toBeUndefined()
    expect(
      parseSession(
        serializeSession({
          ...session,
          initial: { nonsense: true } as never,
        }),
      ),
    ).toBeUndefined()
  })

  it('derives safe filenames', () => {
    expect(sessionFilename('My Flame #7')).toBe('My_Flame_7.steps.json')
    expect(sessionFilename()).toBe('session.steps.json')
    expect(sessionFilename('   ')).toBe('session.steps.json')
  })
})
