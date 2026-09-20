import { createMemo, createRoot, createSignal } from 'solid-js'
import { createStore, unwrap } from 'solid-js/store'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFlameXml } from '@/flame/flameXml'
import { useWorkspaceAutosave } from '@/hooks/useWorkspaceAutosave'
import { setAutosaveRecents, setSaveReminderDismissed, } from '@/utils/autosaveSettings'
import { clearRecentFlames, loadRecentFlames } from '@/utils/recentFlames'
import { applyAudioTargetValues } from './audioAnalysis'
import { deepClone } from './clone'
import { createStoreHistory } from './createStoreHistory'
import { useAudioReactive } from './useAudioReactive'
import type { AudioTargetValue, LiveAudioAnalyzer } from './audioAnalysis'
import type { AudioMapping } from '@/components/AudioReactivePanel/AudioReactivePanel'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// Same reason as useWorkspaceAutosave.test.ts: localStorage is not usable in
// this runtime, so Recents round-trips through an in-memory store.
const storage = new Map<string, string>()
vi.mock('@/utils/storage', () => ({
  safeGetItem: (key: string) => storage.get(key) ?? null,
  safeSetItem: (key: string, value: string) => {
    storage.set(key, value)
    return true
  },
  safeRemoveItem: (key: string) => {
    storage.delete(key)
  },
}))

const AUTHORED_VIBRANCY = 0.2
/** bands[1] = 0.5 mapped into [0.5, 1.5] at sensitivity 1. */
const MODULATED_VIBRANCY = 1
/** rms 0.25 mapped into [0.1, 0.9] at sensitivity 1. */
const MODULATED_PROBABILITY = 0.3

const parsed = parseFlameXml(`<?xml version="1.0" encoding="UTF-8"?>
<flame name="Authored" version="Apophysis 7X" size="800 600"
       center="0 0" scale="200" oversample="1" filter="0.5"
       quality="100" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
  <xform weight="1" color="0.5" swirl="1" coefs="0.5 0 0 0.5 0.2 0.2"/>
</flame>`)

const authoredFlame: FlameDescriptor = {
  ...parsed,
  metadata: { ...parsed.metadata, name: 'Authored' },
  renderSettings: { ...parsed.renderSettings, vibrancy: AUTHORED_VIBRANCY },
}

/*
 * Two target kinds, not one. `dispatchAudioTargetMapping` writes five, and
 * the damage was never confined to render settings: a wiring that drives
 * transform probabilities rewrote the structure of the flame just as
 * permanently as one that drove vibrancy.
 */
const MAPPING: AudioMapping = {
  preset: 'custom',
  mappings: [
    {
      audioFeature: 'bass',
      target: { kind: 'renderSetting', param: 'vibrancy' },
      sensitivity: 1,
      range: [0.5, 1.5],
    },
    {
      audioFeature: 'rms',
      target: {
        kind: 'transformProperty',
        transformIdx: 0,
        property: 'probability',
      },
      sensitivity: 1,
      range: [0.1, 0.9],
    },
  ],
}

const mic: LiveAudioAnalyzer = {
  sampleRate: 48_000,
  dispose: vi.fn(),
  getFrameData: () => ({
    bands: [0, 0.5, 0, 0, 0, 0, 0, 0],
    rms: 0.25,
    centroid: 0,
    flatness: 0,
    onsetStrength: 0,
    isBeat: false,
  }),
}

const firstProbability = (flame: FlameDescriptor) =>
  Object.values(flame.transforms)[0]!.probability

/**
 * The workspace as MainWorkspace wires one: the real history store, the audio
 * loop publishing into the modulation signal, and the derived flame the
 * renderer consumes. `renderedFlame` is what gets drawn; `flameDescriptor` is
 * what the user owns and what the autosave writes.
 */
const workspace = () => {
  const [flameDescriptor, setFlameDescriptor, history] = createStoreHistory(
    createStore<FlameDescriptor>(deepClone(authoredFlame)),
  )
  const [audioEnabled, setAudioEnabled] = createSignal(true)
  const [audioModulation, setAudioModulation] = createSignal<
    AudioTargetValue[] | undefined
  >(undefined)

  useAudioReactive(
    audioEnabled,
    () => undefined,
    () => MAPPING,
    (values) => {
      setAudioModulation(values)
    },
    () => mic,
    () => 'mic',
    () => false,
    () => null,
    () => undefined,
    () => undefined,
  )

  // MainWorkspace's `renderedFlame`: the audio overlay over the flame the
  // editing surfaces see. Nothing is hovered here, so the base is the store.
  const renderedFlame = createMemo<FlameDescriptor>(() => {
    const values = audioModulation()
    if (values === undefined || values.length === 0) return flameDescriptor
    const clone: FlameDescriptor = deepClone(flameDescriptor)
    applyAudioTargetValues(clone, values)
    return clone
  })

  const autosave = useWorkspaceAutosave({
    flameDescriptor,
    getTracks: () => [],
    getConfig: () => undefined,
    agentDriving: () => false,
    showToast: () => 1,
    confirmOverwriteOldest: () => Promise.resolve(false),
    confirmDiscardUnsaved: () => Promise.resolve(false),
  })

  return {
    flameDescriptor,
    setFlameDescriptor,
    history,
    setAudioEnabled,
    renderedFlame,
    autosave,
    /** The document exactly as it would be written to disk. */
    document: () => JSON.stringify(unwrap(flameDescriptor)),
  }
}

/**
 * Solid schedules the hook's first createEffect after the owning root
 * callback returns, so the 30fps interval does not exist until a microtask
 * has run. Advancing the fake clock before that ticks nothing at all.
 */
const startedWorkspace = async () => {
  let started: ReturnType<typeof workspace> | undefined
  const dispose = createRoot((rootDispose) => {
    started = workspace()
    return rootDispose
  })
  await Promise.resolve()
  if (!started) throw new Error('audio overlay test did not initialize')
  return { ...started, dispose }
}

afterEach(() => {
  vi.useRealTimers()
  clearRecentFlames()
  storage.clear()
  setAutosaveRecents('unset')
  setSaveReminderDismissed(false)
})

describe('audio modulation is a render overlay, not a document write', () => {
  it('leaves the authored flame untouched while it runs and after it stops', async () => {
    vi.useFakeTimers()
    const w = await startedWorkspace()
    const authored = w.document()

    vi.advanceTimersByTime(340) // ten modulation ticks

    // The renderer really is being driven, so what follows is not a test of a
    // loop that never ran.
    expect(w.renderedFlame().renderSettings.vibrancy).toBeCloseTo(
      MODULATED_VIBRANCY,
    )
    expect(firstProbability(w.renderedFlame())).toBeCloseTo(
      MODULATED_PROBABILITY,
    )
    // Untouched throughout, not merely restored afterwards.
    expect(w.document()).toBe(authored)

    w.setAudioEnabled(false)
    vi.advanceTimersByTime(340)

    expect(w.document()).toBe(authored)
    expect(w.flameDescriptor.renderSettings.vibrancy).toBe(AUTHORED_VIBRANCY)
    expect(firstProbability(w.flameDescriptor)).toBe(
      firstProbability(authoredFlame),
    )
    // And nothing to undo, because nothing was written.
    expect(w.history.hasUndo()).toBe(false)
    w.dispose()
  })

  it('keeps an edit made while the music plays, and modulates the edited flame', async () => {
    vi.useFakeTimers()
    const w = await startedWorkspace()

    vi.advanceTimersByTime(34)
    // An ordinary edit, mid-track.
    w.setFlameDescriptor((draft) => {
      draft.renderSettings.exposure = 0.9
    }, 'Set Exposure')
    vi.advanceTimersByTime(34)

    // From here on the audio drives the flame the user just edited, not a
    // copy taken before they touched it.
    expect(w.renderedFlame().renderSettings.exposure).toBe(0.9)
    expect(w.renderedFlame().renderSettings.vibrancy).toBeCloseTo(
      MODULATED_VIBRANCY,
    )

    w.setAudioEnabled(false)
    vi.advanceTimersByTime(34)

    // The edit is what survives the track. The modulation is not.
    expect(w.flameDescriptor.renderSettings.exposure).toBe(0.9)
    expect(w.flameDescriptor.renderSettings.vibrancy).toBe(AUTHORED_VIBRANCY)
    expect(firstProbability(w.flameDescriptor)).toBe(
      firstProbability(authoredFlame),
    )
    expect(w.history.hasUndo()).toBe(true)
    w.dispose()
  })

  it('does not turn the document dirty on its own', async () => {
    vi.useFakeTimers()
    const w = await startedWorkspace()
    w.autosave.markLoadedBaseline()
    expect(w.autosave.isFlameDirty()).toBe(false)

    vi.advanceTimersByTime(340)

    // Nobody has touched this document, so neither the autosave prompt nor
    // the five-minute reminder has anything to fire about.
    expect(w.autosave.isFlameDirty()).toBe(false)
    w.dispose()
  })

  it('auto-saves the authored flame, not the frame the music was on', async () => {
    vi.useFakeTimers()
    const w = await startedWorkspace()
    w.autosave.markLoadedBaseline()

    w.setFlameDescriptor((draft) => {
      draft.metadata = { ...draft.metadata, name: 'My flame' }
    }, 'Rename')
    vi.advanceTimersByTime(340)

    w.autosave.autosaveNow()

    const saved = loadRecentFlames()[0]
    expect(saved?.flame.metadata?.name).toBe('My flame')
    expect(saved?.flame.renderSettings.vibrancy).toBe(AUTHORED_VIBRANCY)
    expect(firstProbability(saved!.flame)).toBe(firstProbability(authoredFlame))
    w.dispose()
  })
})
