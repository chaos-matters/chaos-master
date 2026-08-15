// Ensure the vocabulary is registered: the registry is a module-global Map
// and an unregistered id is a silent no-op (same reasoning as portalScript).
import '@/commands/builtins'
import { createRoot, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { vec2f } from 'typegpu/data'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createStoreHistory } from '@/utils/createStoreHistory'
import { createTimelineState } from '@/utils/timeline'
import { cancelSessionRecording, getLiveWorkspaceMutationGeneration, isSessionRecording, lastFinishedSession, notePreviewStarted, recordedActionCount, recordSyntheticAction, reportDerivedWorkspaceWrite, reportDocumentWrite, reportTimelineWrite, reportUnreplayableOnce, startSessionRecording, stopSessionRecording, unnamedWriteCount, withRecordingSuppressed, } from './recorder'
import { replaySessionInstant } from './replay'
import { MAX_ACTION_ARGS, MAX_ACTION_TIMESTAMP_MS, MAX_SESSION_ACTIONS, MAX_SESSION_JSON_CHARS, parseSession, serializeSession, sessionFilename, validateSession, } from './schema'
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
    {
      journal: true,
      onEntryPushed: reportDocumentWrite,
      onPreviewStarted: notePreviewStarted,
    },
  )
  const [zoom, setZoom] = createSignal(1)
  const [position, setPosition] = createSignal(vec2f(0, 0))
  const [pixelRatio, setPixelRatio] = createSignal(1)
  const [sidebarOpen, setSidebarOpen] = createSignal(false)
  const [animationEnabled, setAnimationEnabled] = createSignal(false)
  const [tracks, setTracks] = createSignal<TimelineTrack[]>([])
  const [duration, setDuration] = createSignal(0)
  const [currentFrame, setCurrentFrame] = createSignal(0)
  const [previewHeld, setPreviewHeld] = createSignal(false)
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
      setPreviewHeld,
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
  return {
    flame,
    setFlameDescriptor,
    history,
    ctx,
    previewHeld,
    setPreviewHeld,
  }
}

/** Replay into a world the way MainWorkspace will: history.replace for the
 *  initial document, the registry for every action. */
function replayIntoWorld(
  session: RecordedSession,
  world: ReturnType<typeof makeHeadlessWorld>,
) {
  return replaySessionInstant(session, {
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
  vi.restoreAllMocks()
})

describe('recording start feedback', () => {
  it('reports a successful start and an already-active race', () => {
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })
    expect(startSessionRecording(examples.example1)).toEqual({
      ok: false,
      reason: 'already-recording',
    })
    expect(isSessionRecording()).toBe(true)
  })

  it('reports a workspace that cannot be serialized', () => {
    const circular = deepClone(examples.example1) as FlameDescriptor & {
      circular?: unknown
    }
    circular.circular = circular

    expect(startSessionRecording(circular)).toEqual({
      ok: false,
      reason: 'workspace-not-serializable',
    })
    expect(isSessionRecording()).toBe(false)
  })

  it('reports a workspace outside the bounded session schema', () => {
    const invalid = deepClone(examples.example1)
    invalid.renderSettings.gamma = Number.NaN

    expect(startSessionRecording(invalid)).toEqual({
      ok: false,
      reason: 'workspace-not-recordable',
    })
    expect(isSessionRecording()).toBe(false)
  })
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

  it('records undo as the resulting snapshot so batched replay stays faithful', () => {
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
        'flame.load',
      ])
      expect(
        (session.actions[1]?.args[0] as FlameDescriptor).renderSettings.gamma,
      ).toBe(originalGamma)
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

/**
 * A drag fires `onInput` continuously but is ONE undo step: the control opens
 * a preview, every change accumulates into it, and the commit pushes a single
 * entry. The log has to match that shape — one action per gesture, and the
 * gesture's commit accounted for even though it happens in the control rather
 * than inside a command.
 */
describe('gestures (slider drags)', () => {
  /** What Slider.tsx does around its onInput stream. */
  const drag = (
    world: ReturnType<typeof makeHeadlessWorld>,
    values: number[],
    path = 'gamma',
  ) => {
    world.history.startPreview(`Edit ${path}`)
    for (const value of values) {
      executeCommand('flame.setRenderSetting', world.ctx, path, value)
    }
    world.history.commit()
  }

  it('folds one drag into a single action holding the final value', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      drag(world, [1.1, 1.4, 1.9, 2.3, 2.42])
      const session = stopOrThrow()

      expect(session.actions).toHaveLength(1)
      expect(session.actions[0]?.args).toEqual(['gamma', 2.42])
      // The label has to fold with the args: a describing command renders
      // the value into its label, and keeping the gesture's FIRST label left
      // real recordings quoting a value the action no longer carried.
      expect(session.actions[0]?.label).toBe('Set gamma to 2.42')
      // The commit lands outside any command; it is claimed by the gesture,
      // not counted as an anonymous write.
      expect(session.unnamedWriteCount).toBe(0)
      expect(world.flame.renderSettings.gamma).toBeCloseTo(2.42, 5)
      dispose()
    })
  })

  it('keeps two drags of the same control as two actions (two undo steps)', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      drag(world, [1.5, 2])
      drag(world, [2.5, 3])
      const session = stopOrThrow()

      // Folding across the entry boundary would leave one action against two
      // undo steps, and a later recorded undo would revert too much.
      expect(session.actions.map((a) => a.args)).toEqual([
        ['gamma', 2],
        ['gamma', 3],
      ])
      expect(session.unnamedWriteCount).toBe(0)
      dispose()
    })
  })

  it('keeps distinct controls apart but folds a return to an earlier one', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      world.history.startPreview('Edit')
      executeCommand('flame.setRenderSetting', world.ctx, 'gamma', 2)
      executeCommand('flame.setRenderSetting', world.ctx, 'contrast', 3)
      executeCommand('flame.setRenderSetting', world.ctx, 'gamma', 2.5)
      world.history.commit()
      const session = stopOrThrow()

      // Two targets, so two actions — but the second gamma folds into the
      // first rather than appending, since only its final value survives the
      // gesture anyway. Position is the first touch, value is the last.
      expect(session.actions.map((a) => a.args)).toEqual([
        ['gamma', 2.5],
        ['contrast', 3],
      ])
      expect(world.flame.renderSettings.gamma).toBeCloseTo(2.5, 5)
      expect(world.flame.renderSettings.contrast).toBeCloseTo(3, 5)
      dispose()
    })
  })

  it('still flags a gesture no command took part in', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      // An editor still driving the raw setter — exactly what M3 has left
      // to convert, and the ratchet must keep seeing it.
      world.history.startPreview('Affine Translation')
      world.setFlameDescriptor((draft) => {
        draft.renderSettings.exposure = 0.8
      })
      world.history.commit()
      const session = stopOrThrow()

      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(1)
      dispose()
    })
  })

  it('replays a folded drag into the same document', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      drag(a, [1.2, 1.8, 2.42])
      drag(a, [0.2, 0.35], 'paletteSpeed')
      const session = stopOrThrow()

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('rejects a path outside the schema vocabulary', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      const before = deepClone(world.flame)
      startSessionRecording(world.flame)
      // Hand-edited logs are a supported workflow, so a bad path must be
      // refused rather than written into the document.
      executeCommand('flame.setRenderSetting', world.ctx, 'notAThing', 1)
      executeCommand('flame.setRenderSetting', world.ctx, 'gamma', 'nope')
      stopOrThrow()
      expect(deepClone(world.flame)).toEqual(before)
      dispose()
    })
  })
})

/**
 * The transform card's structural actions (M3). Each one either has a
 * state-dependent branch or carries computed randomness, so each needs to
 * come back byte-identical on replay.
 */
describe('transform-card commands', () => {
  const firstTransformId = (flame: FlameDescriptor) =>
    Object.keys(flame.transforms)[0]!
  const firstVariationId = (flame: FlameDescriptor, tid: string) =>
    Object.keys(
      flame.transforms[tid as keyof typeof flame.transforms]!.variations,
    )[0]!

  it('records visibility as a target state, not a toggle', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const tid = firstTransformId(a.flame)
      startSessionRecording(a.flame)
      executeCommand('flame.setTransformVisible', a.ctx, tid, false)
      const session = stopOrThrow()

      expect(session.actions[0]?.args).toEqual([tid, false])
      // A toggle would flip whatever the replayed document showed; an
      // explicit target lands the same way from any starting state.
      const b = makeHeadlessWorld(examples.example1)
      b.setFlameDescriptor((draft) => {
        draft.transforms[tid as keyof typeof draft.transforms]!.visible = false
      })
      replayIntoWorld(session, b)
      expect(
        b.flame.transforms[tid as keyof typeof b.flame.transforms]!.visible,
      ).toBe(false)
      dispose()
    })
  })

  it('deletes a transform, and resets rather than empties the last one', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const ids = Object.keys(a.flame.transforms)
      expect(ids.length).toBeGreaterThan(1)
      startSessionRecording(a.flame)
      // Delete every transform, one by one: the final call must reset.
      for (const tid of ids) {
        executeCommand('flame.deleteTransform', a.ctx, tid)
      }
      const session = stopOrThrow()

      const remaining = Object.keys(a.flame.transforms)
      expect(remaining).toHaveLength(1)
      // The reset branch mints a variation id — pre-minted into the args, so
      // replay reproduces it exactly rather than generating a fresh UUID.
      const b = makeHeadlessWorld(examples.example1)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('deletes a variation, and resets rather than empties the last one', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const tid = firstTransformId(a.flame)
      const vids = Object.keys(
        a.flame.transforms[tid as keyof typeof a.flame.transforms]!.variations,
      )
      startSessionRecording(a.flame)
      for (const vid of vids) {
        executeCommand('flame.deleteVariation', a.ctx, tid, vid)
      }
      const session = stopOrThrow()

      expect(
        Object.keys(
          a.flame.transforms[tid as keyof typeof a.flame.transforms]!
            .variations,
        ),
      ).toHaveLength(1)
      const b = makeHeadlessWorld(examples.example1)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('replays a randomized variation without re-rolling it', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const tid = firstTransformId(a.flame)
      const vid = firstVariationId(a.flame, tid)
      startSessionRecording(a.flame)
      // The dice button rolls in the handler and passes the result, so the
      // log carries the outcome rather than an intent to randomize.
      executeCommand(
        'flame.setVariation',
        a.ctx,
        tid,
        vid,
        {
          type: 'linearVar',
          weight: 0.731,
          visible: true,
        },
        'randomize',
      )
      const session = stopOrThrow()

      expect(session.actions[0]?.focus).toBe(
        `focus:tx:${tid}:variation:${vid}:randomize`,
      )

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame.transforms)).toEqual(
        deepClone(a.flame.transforms),
      )
      dispose()
    })
  })

  it('keeps each variation action paired with its exact follow-cam identity', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      const transformIds = Object.keys(world.flame.transforms)
      const firstTid = transformIds[0]!
      const laterTid = transformIds.at(-1)!
      const firstVid = firstVariationId(world.flame, firstTid)
      const laterVid = firstVariationId(world.flame, laterTid)

      startSessionRecording(world.flame)
      executeCommand('flame.setVariation', world.ctx, firstTid, firstVid, {
        type: 'linearVar',
        weight: 0.6,
        visible: true,
      })
      executeCommand('flame.setVariation', world.ctx, laterTid, laterVid, {
        type: 'swirlVar',
        weight: 0.8,
        visible: true,
      })
      const session = stopOrThrow()

      expect(
        session.actions.map(({ args, focus }) => [args[0], args[1], focus]),
      ).toEqual([
        [firstTid, firstVid, `focus:tx:${firstTid}:variation:${firstVid}:type`],
        [laterTid, laterVid, `focus:tx:${laterTid}:variation:${laterVid}:type`],
      ])
      dispose()
    })
  })

  it('applies a variation selection as one step', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const tid = firstTransformId(a.flame)
      const vid = firstVariationId(a.flame, tid)
      startSessionRecording(a.flame)
      executeCommand(
        'flame.applyVariationSelection',
        a.ctx,
        tid,
        vid,
        { a: 0.5, b: 0.1, c: 0, d: 0.2, e: 0.5, f: 0 },
        { type: 'swirlVar', weight: 0.8, visible: true },
      )
      const session = stopOrThrow()

      // One action, so one undo step on replay — matching the single setter
      // the variation browser uses live.
      expect(session.actions).toHaveLength(1)
      expect(a.history.hasUndo()).toBe(true)
      a.history.undo()
      expect(deepClone(a.flame)).toEqual(deepClone(examples.example1))

      const b = makeHeadlessWorld(examples.example1)
      replayIntoWorld(session, b)
      const t = b.flame.transforms[tid as keyof typeof b.flame.transforms]!
      expect(t.preAffine.a).toBeCloseTo(0.5, 5)
      expect(t.variations[vid as keyof typeof t.variations]!.type).toBe(
        'swirlVar',
      )
      dispose()
    })
  })

  it('folds an affine drag into one action per transform and side', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      const tid = firstTransformId(world.flame)
      startSessionRecording(world.flame)
      // The affine editor recomputes the whole matrix each frame.
      world.history.startPreview('Affine Translation')
      for (const f of [0.1, 0.2, 0.3]) {
        executeCommand('flame.setTransformAffine', world.ctx, tid, 'pre', {
          a: 1,
          b: 0,
          c: f,
          d: 0,
          e: 1,
          f: 0,
        })
      }
      // Same transform, other side: a separate target, so its own action.
      executeCommand('flame.setTransformAffine', world.ctx, tid, 'post', {
        a: 2,
        b: 0,
        c: 0,
        d: 0,
        e: 2,
        f: 0,
      })
      world.history.commit()
      const session = stopOrThrow()

      expect(session.actions).toHaveLength(2)
      expect(session.actions[0]?.args[2]).toMatchObject({ c: 0.3 })
      expect(session.unnamedWriteCount).toBe(0)

      const b = makeHeadlessWorld(examples.example1)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(world.flame))
      dispose()
    })
  })

  it('folds a probability drag per transform, not across transforms', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      const [t0, t1] = Object.keys(world.flame.transforms)
      startSessionRecording(world.flame)
      world.history.startPreview('Edit Probability')
      executeCommand('flame.setProbability', world.ctx, t0, 0.3)
      executeCommand('flame.setProbability', world.ctx, t0, 0.4)
      executeCommand('flame.setProbability', world.ctx, t1, 0.9)
      world.history.commit()
      const session = stopOrThrow()

      expect(session.actions.map((a) => a.args)).toEqual([
        [t0, 0.4],
        [t1, 0.9],
      ])
      expect(session.unnamedWriteCount).toBe(0)
      dispose()
    })
  })
})

describe('camera and symmetry commands', () => {
  it('addresses nested camera fields by path', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.setRenderSetting', a.ctx, 'camera.zoom', 2.5)
      executeCommand(
        'flame.setRenderSetting',
        a.ctx,
        'camera.position',
        [0.25, -0.5],
      )
      executeCommand('flame.setRenderSetting', a.ctx, 'camera3D.theta', 1.2)
      const session = stopOrThrow()

      expect(a.flame.renderSettings.camera.zoom).toBeCloseTo(2.5, 5)
      expect(a.flame.renderSettings.camera.position).toEqual([0.25, -0.5])
      expect(session.unnamedWriteCount).toBe(0)

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('detaches a held timeline frame for live and replayed camera edits', () => {
    createRoot((dispose) => {
      const live = makeHeadlessWorld(examples.example1)
      live.setPreviewHeld(true)
      startSessionRecording(live.flame)
      executeCommand(
        'flame.setRenderSetting',
        live.ctx,
        'camera3D.target',
        [0.5, -0.25, 1],
      )
      const session = stopOrThrow()

      expect(live.previewHeld()).toBe(false)

      const replay = makeHeadlessWorld(examples.initExample)
      replay.setPreviewHeld(true)
      replayIntoWorld(session, replay)

      expect(replay.previewHeld()).toBe(false)
      expect(replay.flame.renderSettings.camera3D.target).toEqual([
        0.5, -0.25, 1,
      ])
      dispose()
    })
  })

  it('folds a camera pan into one action but keeps zoom separate', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      // WheelZoomCamera2D brackets each gesture with startPreview/commit.
      world.history.startPreview('Camera pan')
      for (const x of [0.1, 0.2, 0.3]) {
        executeCommand('flame.setRenderSetting', world.ctx, 'camera.position', [
          x,
          0,
        ])
      }
      executeCommand('flame.setRenderSetting', world.ctx, 'camera.zoom', 3)
      world.history.commit()
      const session = stopOrThrow()

      expect(session.actions.map((a) => a.args)).toEqual([
        ['camera.position', [0.3, 0]],
        ['camera.zoom', 3],
      ])
      expect(session.unnamedWriteCount).toBe(0)
      dispose()
    })
  })

  it('folds an interleaved zoom-about-a-point gesture', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      // What the wheel actually does: zoom and re-position alternately, all
      // inside ONE debounced preview. Matching only the immediately previous
      // action never folded this, so a real scroll logged dozens of steps.
      world.history.startPreview('Camera zoom')
      for (let i = 1; i <= 12; i++) {
        executeCommand('flame.setRenderSetting', world.ctx, 'camera.zoom', i)
        executeCommand('flame.setRenderSetting', world.ctx, 'camera.position', [
          i / 100,
          0,
        ])
      }
      world.history.commit()
      const session = stopOrThrow()

      expect(session.actions.map((a) => a.args)).toEqual([
        ['camera.zoom', 12],
        ['camera.position', [0.12, 0]],
      ])
      expect(session.unnamedWriteCount).toBe(0)
      dispose()
    })
  })

  it('rejects a nested path outside the vocabulary', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      const before = deepClone(world.flame)
      startSessionRecording(world.flame)
      executeCommand('flame.setRenderSetting', world.ctx, 'camera.nope', 1)
      executeCommand('flame.setRenderSetting', world.ctx, 'camera', 1)
      executeCommand(
        'flame.setRenderSetting',
        world.ctx,
        'camera.position',
        [1, 2, 3],
      )
      stopOrThrow()
      expect(deepClone(world.flame)).toEqual(before)
      dispose()
    })
  })

  it('replays symmetry with the ids it minted', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.applySymmetry', a.ctx, 4, 'dihedral')
      const session = stopOrThrow()

      // 4-fold rotational adds 3, dihedral adds its mirror: 4 pairs.
      const ids = session.actions[0]?.args[2]
      expect(Array.isArray(ids) && ids.length).toBe(4)
      const symmetryIds = Object.keys(a.flame.transforms).filter((tid) =>
        tid.startsWith('_sym__'),
      )
      expect(symmetryIds).toHaveLength(4)

      const b = makeHeadlessWorld(examples.example1)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('regenerating symmetry replaces the previous set', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      executeCommand('flame.applySymmetry', world.ctx, 6, 'rotational')
      expect(
        Object.keys(world.flame.transforms).filter((t) =>
          t.startsWith('_sym__'),
        ),
      ).toHaveLength(5)
      executeCommand('flame.applySymmetry', world.ctx, 3, 'rotational')
      expect(
        Object.keys(world.flame.transforms).filter((t) =>
          t.startsWith('_sym__'),
        ),
      ).toHaveLength(2)
      dispose()
    })
  })
})

describe('blend and morph commands', () => {
  it('carries the blend partner in the args, and clears it with null', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.setBlendFlame', a.ctx, examples.example2)
      executeCommand('flame.setBlendWeight', a.ctx, 0.4)
      const session = stopOrThrow()

      expect(a.flame.renderSettings.blendFlame).toBeDefined()
      expect(a.flame.renderSettings.blendWeight).toBeCloseTo(0.4, 5)
      expect(session.unnamedWriteCount).toBe(0)

      // Replayed into a world that never saw example2 — the partner rides
      // along in the log rather than being looked up.
      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))

      // Clearing round-trips too (null, since JSON has no undefined).
      startSessionRecording(a.flame)
      executeCommand('flame.setBlendFlame', a.ctx, null)
      const clearing = stopOrThrow()
      expect(a.flame.renderSettings.blendFlame).toBeUndefined()
      replayIntoWorld(clearing, b)
      expect(b.flame.renderSettings.blendFlame).toBeUndefined()
      dispose()
    })
  })

  it('sets up a morph as one step: partner and full weight', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.setupMorph', a.ctx, examples.example2)
      const session = stopOrThrow()

      expect(session.actions).toHaveLength(1)
      expect(a.flame.renderSettings.blendWeight).toBe(1)
      // One undo reverts both halves, as the single setter did before.
      a.history.undo()
      expect(deepClone(a.flame)).toEqual(deepClone(examples.example1))
      dispose()
    })
  })

  it('folds a blend-weight drag into one action', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      world.history.startPreview('Blend Weight')
      for (const w of [0.1, 0.3, 0.7]) {
        executeCommand('flame.setBlendWeight', world.ctx, w)
      }
      world.history.commit()
      const session = stopOrThrow()

      expect(session.actions).toHaveLength(1)
      expect(session.actions[0]?.args).toEqual([0.7])
      expect(session.unnamedWriteCount).toBe(0)
      dispose()
    })
  })

  it('merges a partial render-settings patch', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const before = a.flame.renderSettings.gamma
      startSessionRecording(a.flame)
      executeCommand('flame.updateRenderSettings', a.ctx, {
        exposure: 0.42,
        vibrancy: 0.66,
      })
      const session = stopOrThrow()

      expect(a.flame.renderSettings.exposure).toBeCloseTo(0.42, 5)
      // A merge, not a replacement: untouched keys survive.
      expect(a.flame.renderSettings.gamma).toBe(before)

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('folds one compound exposure drag but keeps separate drags distinct', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)

      world.history.startPreview('Exposure')
      for (const exposure of [0.4, 0.8, 1.2]) {
        executeCommand(
          'flame.updateRenderSettings',
          world.ctx,
          {
            exposure,
            autoExposure3DBase: exposure,
            autoExposure3DRefRadius: 5,
          },
          'render',
        )
      }
      world.history.commit()
      world.history.startPreview('Exposure')
      executeCommand(
        'flame.updateRenderSettings',
        world.ctx,
        {
          exposure: 1.6,
          autoExposure3DBase: 1.6,
          autoExposure3DRefRadius: 5,
        },
        'render',
      )
      world.history.commit()

      const session = stopOrThrow()
      expect(session.actions).toHaveLength(2)
      expect(session.actions[0]?.args).toEqual([
        {
          exposure: 1.2,
          autoExposure3DBase: 1.2,
          autoExposure3DRefRadius: 5,
        },
        'render',
      ])
      expect(session.actions[1]?.args).toEqual([
        {
          exposure: 1.6,
          autoExposure3DBase: 1.6,
          autoExposure3DRefRadius: 5,
        },
        'render',
      ])
      dispose()
    })
  })
})

describe('palette and document-load commands', () => {
  const palette = {
    id: 'test-palette',
    name: 'Test',
    entries: [
      { id: 'e0', position: 0, a: -0.5, b: 0.1 },
      { id: 'e1', position: 1, a: 0.2, b: 0.5 },
    ],
  }

  it('applies a palette as one step: colours and the palette itself', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.applyPalette', a.ctx, palette)
      const session = stopOrThrow()

      expect(session.actions).toHaveLength(1)
      expect(a.flame.renderSettings.palette?.id).toBe('test-palette')
      // Recolouring is index-based and deterministic, so the palette is all
      // the log needs to carry.
      const b = makeHeadlessWorld(examples.example1)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))

      // One undo takes back both halves, as it did before commands.
      a.history.undo()
      expect(a.flame.renderSettings.palette).toBeUndefined()
      expect(deepClone(a.flame)).toEqual(deepClone(examples.example1))
      dispose()
    })
  })

  it('carries the restore colours for a palette removal in the args', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      const before = Object.fromEntries(
        Object.entries(a.flame.transforms).map(([tid, t]) => [
          tid,
          { x: t.color.x, y: t.color.y },
        ]),
      )
      startSessionRecording(a.flame)
      executeCommand('flame.applyPalette', a.ctx, palette)
      // The editor stashes the pre-palette colours in a SIGNAL, which no log
      // can reconstruct — so they travel as an argument.
      executeCommand('flame.removePalette', a.ctx, before)
      const session = stopOrThrow()

      expect(a.flame.renderSettings.palette).toBeUndefined()
      expect(deepClone(a.flame)).toEqual(deepClone(examples.example1))

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      dispose()
    })
  })

  it('embeds the document in a load, so an import still replays', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand(
        'flame.load',
        a.ctx,
        examples.example2,
        'Load History Flame',
      )
      executeCommand('flame.setGamma', a.ctx, 2.9)
      const session = stopOrThrow()

      // Replay into a world that never saw example2: the descriptor rides
      // along in the log rather than being looked up.
      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)
      expect(deepClone(b.flame)).toEqual(deepClone(a.flame))
      expect(b.flame.renderSettings.gamma).toBeCloseTo(2.9, 5)
      expect(session.unnamedWriteCount).toBe(0)
      dispose()
    })
  })

  it('refuses a load whose payload is not a flame', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      const before = deepClone(world.flame)
      startSessionRecording(world.flame)
      executeCommand('flame.load', world.ctx, { nonsense: true })
      stopOrThrow()
      expect(deepClone(world.flame)).toEqual(before)
      dispose()
    })
  })

  it('refuses hostile bulk render settings and final transforms', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      const before = deepClone(world.flame)
      executeCommand('flame.updateRenderSettings', world.ctx, { camera: null })
      executeCommand('flame.setFinalTransform', world.ctx, {})
      expect(deepClone(world.flame)).toEqual(before)
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

  it('captures the resulting workspace when undo is routed to the timeline', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      let undone = false
      const timelineSnapshot = {
        config: {
          fps: 30,
          timeScale: 1,
          startFrame: 0,
          endFrame: 90,
          loop: true,
        },
        tracks: [],
      }
      const ctx: CommandContext = {
        ...world.ctx,
        timeline: {
          ...world.ctx.timeline,
          edit: {
            removeKeyframe: () => {},
            setKeyframeValue: () => {},
            setKeyframeInterp: () => {},
            moveKeyframe: () => {},
            removeTrack: () => {},
            clearTracks: () => {},
            setLoopMode: () => {},
            setAutoKeyframe: () => {},
            snapshot: () => timelineSnapshot,
            load: () => {},
          },
        },
        history: {
          undo: () => {
            undone = true
          },
          redo: () => {},
          // What the router reports after, say, a keyframe drag.
          peekUndoTarget: () => ({ system: 'timeline', seq: 1_000_000 }),
        },
      }
      startSessionRecording(world.flame)
      executeCommand('history.undo', ctx)
      const session = stopOrThrow()

      expect(undone).toBe(true)
      expect(session.actions.map((action) => action.id)).toEqual([
        'recorder.restoreWorkspaceSnapshot',
      ])
      expect(session.actions[0]?.args[1]).toEqual(timelineSnapshot)
      expect(session.unnamedWriteCount).toBe(0)
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
  it('reports a high-rate unreplayable effect only once per take', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)

      for (let frame = 0; frame < 300; frame++) {
        reportUnreplayableOnce(
          'live-audio-modulation',
          'Live audio modulation is not embedded',
        )
        world.history.setSilently((draft) => {
          draft.renderSettings.exposure = frame / 300
        })
      }

      expect(world.history.hasUndo()).toBe(false)
      expect(unnamedWriteCount()).toBe(1)
      expect(stopOrThrow().unnamedWriteCount).toBe(1)
      dispose()
    })
  })

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

describe('untrusted replay command preflight', () => {
  it('marks wall-clock timeline transport unreplayable', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      executeCommand('timeline.play', world.ctx)
      const session = stopOrThrow()

      expect(session.actions).toEqual([])
      expect(session.unnamedWriteCount).toBe(1)
      expect(executeReplayCommand('timeline.play', world.ctx)).toBe(false)
      dispose()
    })
  })

  it('rejects unknown commands and attacker-sized symmetry before normalize', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      expect(executeReplayCommand('future.command', world.ctx)).toBe(false)
      expect(
        executeReplayCommand(
          'flame.applySymmetry',
          world.ctx,
          1_000_000_000,
          'rotational',
        ),
      ).toBe(false)
      expect(Object.keys(world.flame.transforms)).toEqual(
        Object.keys(examples.example1.transforms),
      )
      expect(
        executeReplayCommand(
          'flame.applySymmetry',
          world.ctx,
          3,
          'rotational',
          [
            ['duplicate-transform', 'variation-a'],
            ['duplicate-transform', 'variation-b'],
          ],
        ),
      ).toBe(false)
      dispose()
    })
  })

  it('accepts bounded symmetry edges and rejects imported history commands', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      expect(
        executeReplayCommand(
          'flame.applySymmetry',
          world.ctx,
          64,
          'rotational',
          Array.from({ length: 63 }, (_, index) => [
            `_sym__${index}`,
            `variation_${index}`,
          ]),
        ),
      ).toBe(true)
      expect(Object.keys(world.flame.transforms)).toHaveLength(
        Object.keys(examples.example1.transforms).length + 63,
      )
      expect(executeReplayCommand('history.undo', world.ctx)).toBe(false)
      dispose()
    })
  })

  it('rejects oversized generator configs before entering generator loops', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      expect(
        executeReplayCommand('flame.randomize', world.ctx, 42, {
          strength: 0.5,
          minTransforms: 1,
          maxTransforms: 1_000_000_000,
          minVariations: 1,
          maxVariations: 2,
          allowedVariations: [],
          dimensions: 2,
        }),
      ).toBe(false)
      expect(deepClone(world.flame)).toEqual(deepClone(examples.example1))
      expect(
        executeReplayCommand('flame.randomize', world.ctx, 42.5, {
          strength: 0.5,
          minTransforms: 1,
          maxTransforms: 2,
          minVariations: 1,
          maxVariations: 2,
          allowedVariations: [],
          dimensions: 2,
        }),
      ).toBe(false)
      dispose()
    })
  })

  it('preflights structural load commands instead of accepting a silent no-op', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      expect(executeReplayCommand('flame.load', world.ctx, {})).toBe(false)
      expect(
        executeReplayCommand('timeline.loadTimeline', world.ctx, {
          config: { fps: 30 },
          tracks: [],
        }),
      ).toBe(false)
      expect(deepClone(world.flame)).toEqual(deepClone(examples.example1))
      dispose()
    })
  })
})

describe('suppression', () => {
  it('tracks silent derived writes unless replay suppression owns them', () => {
    const before = getLiveWorkspaceMutationGeneration()
    reportDerivedWorkspaceWrite()
    expect(getLiveWorkspaceMutationGeneration()).toBe(before + 1)

    withRecordingSuppressed(() => {
      reportDerivedWorkspaceWrite()
    })
    expect(getLiveWorkspaceMutationGeneration()).toBe(before + 1)
  })

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

  it('refuses to replay while a recording is active', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.setGamma', a.ctx, 3.7)
      const session = stopOrThrow()

      const b = makeHeadlessWorld(examples.initExample)
      startSessionRecording(b.flame)
      expect(replayIntoWorld(session, b)).toBe(false)
      const second = stopOrThrow()
      expect(second.actions).toEqual([])
      expect(second.unnamedWriteCount).toBe(0)
      expect(deepClone(b.flame)).toEqual(deepClone(examples.initExample))
      dispose()
    })
  })
})

describe('live recording persistence budgets', () => {
  it('keeps at most the schema action limit and reports one fidelity marker', () => {
    startSessionRecording(examples.example1)
    for (let index = 0; index < MAX_SESSION_ACTIONS + 3; index++) {
      recordSyntheticAction('flame.setGamma', [index])
    }

    const session = stopOrThrow()
    expect(session.actions).toHaveLength(MAX_SESSION_ACTIONS)
    expect(session.unnamedWriteCount).toBe(1)
    expect(validateSession(session)).toBeDefined()
  })

  it('drops schema-oversized actions without letting repeated events flood markers', () => {
    startSessionRecording(examples.example1)
    for (let attempt = 0; attempt < 3; attempt++) {
      recordSyntheticAction(
        'flame.setGamma',
        Array(MAX_ACTION_ARGS + 1).fill(attempt),
      )
    }

    const session = stopOrThrow()
    expect(session.actions).toEqual([])
    expect(session.unnamedWriteCount).toBe(1)
    expect(validateSession(session)).toBeDefined()
  })

  it('drops actions after the timestamp limit with one fidelity marker', () => {
    const now = vi.spyOn(globalThis.performance, 'now').mockReturnValue(1000)
    startSessionRecording(examples.example1)
    now.mockReturnValue(1000 + MAX_ACTION_TIMESTAMP_MS + 1)

    recordSyntheticAction('flame.setGamma', [2])
    recordSyntheticAction('flame.setExposure', [0.5])

    const session = stopOrThrow()
    expect(session.actions).toEqual([])
    expect(session.unnamedWriteCount).toBe(1)
    expect(validateSession(session)).toBeDefined()
  })

  it('rejects an action that would exceed the whole-session JSON budget', () => {
    startSessionRecording(examples.example1)
    recordSyntheticAction('flame.setGamma', [
      'x'.repeat(MAX_SESSION_JSON_CHARS),
    ])

    const session = stopOrThrow()
    expect(session.actions).toEqual([])
    expect(session.unnamedWriteCount).toBe(1)
    expect(serializeSession(session).length).toBeLessThanOrEqual(
      MAX_SESSION_JSON_CHARS,
    )
    expect(validateSession(session)).toBeDefined()
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

  /** Labels for a couple of path-addressed edits. */
  function recordDescribed(): (string | undefined)[] {
    return createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      startSessionRecording(world.flame)
      executeCommand('flame.setRenderSetting', world.ctx, 'gamma', 2.42)
      executeCommand('flame.setRenderSetting', world.ctx, 'camera.zoom', 3)
      const session = stopOrThrow()
      dispose()
      return session.actions.map((a) => a.label)
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
    // A generic command describes the invocation instead of itself, so the
    // replay step list reads "Set gamma to 2.42" rather than repeating "Set
    // Render Setting" for every parameter.
    expect(recordDescribed()).toEqual([
      'Set gamma to 2.42',
      'Set camera.zoom to 3',
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
    expect(
      parseSession(
        serializeSession({
          ...session,
          actions: [{ t: 0, id: 'history.undo', args: [] }],
        }),
      ),
    ).toBeUndefined()
    expect(
      parseSession(
        serializeSession({
          ...session,
          actions: [{ t: 0, id: 'flame.setGamma', args: Array(65).fill(1) }],
        }),
      ),
    ).toBeUndefined()
    expect(
      parseSession(
        serializeSession({
          ...session,
          actions: Array.from({ length: 2001 }, () => ({
            t: 0,
            id: 'flame.setGamma',
            args: [2],
          })),
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

/**
 * A session is not just the flame. The timeline is a second document with its
 * own undo stack, and the audio wiring drives the flame every frame — a
 * recording that carried neither replayed half the work (docs/recorder-coverage.md).
 */
describe('session start state beyond the flame', () => {
  const timeline = {
    config: {
      fps: 30,
      timeScale: 1,
      startFrame: 0,
      endFrame: 90,
      loop: true,
    },
    tracks: [{ parameterPath: 'gamma', keyframes: [{ frame: 0, value: 1 }] }],
  }
  const audio = {
    mapping: {
      preset: 'pulse' as const,
      mappings: [
        {
          audioFeature: 'bass' as const,
          target: { kind: 'renderSetting' as const, param: 'gamma' as const },
          sensitivity: 1,
          range: [0, 2] as [number, number],
        },
      ],
    },
    enabled: true,
    source: 'file' as const,
    trackName: 'track.mp3',
  }
  const view = {
    qualityPreset: 'high',
    pixelRatio: 0.5 as const,
    adaptiveFilter: true,
    stochasticFilter: false,
    flyMode: false,
    showTimeline: true,
    sidebarOpen: true,
  }

  it('carries timeline, audio, and view state through a round trip', () => {
    startSessionRecording(examples.example1, { timeline, audio, view })
    const session = stopSessionRecording()!
    expect(session.initialTimeline).toEqual(timeline)
    expect(session.initialAudio).toEqual(audio)
    expect(session.initialView).toEqual(view)

    const parsed = parseSession(serializeSession(session))
    expect(parsed?.initialTimeline).toEqual(timeline)
    expect(parsed?.initialAudio).toEqual(audio)
    expect(parsed?.initialView).toEqual(view)
  })

  it('refuses a hand-edited mapping that would write nonsense every frame', () => {
    startSessionRecording(examples.example1, { audio })
    const session = stopSessionRecording()!
    expect(
      parseSession(
        serializeSession({
          ...session,
          initialAudio: {
            ...audio,
            mapping: {
              ...audio.mapping,
              // Not a render setting the flame has.
              mappings: [
                {
                  ...audio.mapping.mappings[0]!,
                  target: { kind: 'renderSetting', param: 'banana' },
                },
              ],
            },
          } as never,
        }),
      ),
    ).toBeUndefined()
  })

  it('leaves an older session without them parseable', () => {
    startSessionRecording(examples.example1)
    const session = stopSessionRecording()!
    expect(session.initialTimeline).toBeUndefined()
    expect(parseSession(serializeSession(session))).toBeDefined()
  })
})

describe('finished-session export association', () => {
  const finishSession = () => {
    startSessionRecording(examples.example1)
    return stopSessionRecording()!
  }

  it('clears after a later flame or timeline document write', () => {
    finishSession()
    expect(lastFinishedSession()).toBeDefined()
    reportDocumentWrite('later flame edit')
    expect(lastFinishedSession()).toBeUndefined()

    finishSession()
    reportTimelineWrite('later timeline edit')
    expect(lastFinishedSession()).toBeUndefined()
  })

  it('clears after a later command, but not when opening export', () => {
    createRoot((dispose) => {
      const world = makeHeadlessWorld(examples.example1)
      finishSession()
      executeCommand('export.png', world.ctx)
      expect(lastFinishedSession()).toBeDefined()

      executeCommand('sidebar.open', world.ctx, true)
      expect(lastFinishedSession()).toBeUndefined()
      dispose()
    })
  })

  it('clears after a suppressed document boundary represented synthetically', () => {
    finishSession()
    expect(lastFinishedSession()).toBeDefined()

    withRecordingSuppressed(() => {
      // The live load/switch runs here; its exact result is announced after
      // suppression so an active recorder would capture one deterministic
      // action instead of the internal writes.
    })
    recordSyntheticAction('flame.load', [examples.initExample, 'Load flame'])

    expect(lastFinishedSession()).toBeUndefined()
  })

  it('tracks direct timeline transport without flooding the recording', () => {
    const timeline = createTimelineState()

    finishSession()
    timeline.goToFrame(12)
    expect(lastFinishedSession()).toBeUndefined()

    startSessionRecording(examples.example1)
    timeline.goToFrame(20)
    timeline.togglePlay()
    timeline.advanceFrame()
    timeline.pause()

    const session = stopOrThrow()
    expect(session.actions).toEqual([])
    expect(session.unnamedWriteCount).toBe(1)
  })
})

describe('follow-cam hints', () => {
  afterEach(() => {
    cancelSessionRecording()
  })

  it('records what to look at alongside each step', () => {
    createRoot((dispose) => {
      const { ctx } = makeHeadlessWorld(examples.initExample)
      startSessionRecording(examples.initExample)
      executeCommand('flame.setRenderSetting', ctx, 'gamma', 2.4)
      const session = stopSessionRecording()!
      expect(session.actions[0]?.focus).toBe('param:gamma')
      dispose()
    })
  })

  it('keeps the hint pointing at the final target through a coalesced gesture', () => {
    createRoot((dispose) => {
      const { ctx, history } = makeHeadlessWorld(examples.initExample)
      startSessionRecording(examples.initExample)
      history.startPreview('drag')
      executeCommand('flame.setRenderSetting', ctx, 'gamma', 2)
      executeCommand('flame.setRenderSetting', ctx, 'gamma', 3)
      history.commit()
      const session = stopSessionRecording()!
      expect(session.actions).toHaveLength(1)
      expect(session.actions[0]?.focus).toBe('param:gamma')
      dispose()
    })
  })
})
