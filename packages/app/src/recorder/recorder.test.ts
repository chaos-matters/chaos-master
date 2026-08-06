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
    { onEntryPushed: reportDocumentWrite },
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
    history: { undo: history.undo, redo: history.redo },
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

  it('replays id-minting commands up to fresh ids (determinism gap, M2)', () => {
    createRoot((dispose) => {
      const a = makeHeadlessWorld(examples.example1)
      startSessionRecording(a.flame)
      executeCommand('flame.clearTransforms', a.ctx)
      executeCommand('flame.addTransform', a.ctx)
      executeCommand('flame.setProbability', a.ctx, 0, 0.6)
      const session = stopOrThrow()

      const b = makeHeadlessWorld(examples.initExample)
      replayIntoWorld(session, b)

      // `flame.addTransform` mints a fresh TransformId/VariationId inside its
      // setter, so the replayed document matches only structurally — the M2
      // milestone (ids recorded as args) upgrades this to strict equality.
      const shape = (f: FlameDescriptor) =>
        Object.values(deepClone(f).transforms).map((t) => ({
          ...t,
          variations: Object.values(t.variations),
        }))
      expect(shape(b.flame)).toEqual(shape(a.flame))
      expect(deepClone(b.flame).renderSettings).toEqual(
        deepClone(a.flame).renderSettings,
      )
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
