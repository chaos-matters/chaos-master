import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { applyReplayAudioWiring, canEnableReplayAudio, replaySessionInstant, sessionMayEnableSonification, } from './replay'
import { SESSION_FORMAT_VERSION } from './schema'
import { SONIFICATION_SNAPSHOT_VERSION } from './sonificationState'
import type { SonificationSnapshot } from './sonificationState'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'

const snapshot = (
  overrides: Partial<AudioWiringSnapshot> = {},
): AudioWiringSnapshot => ({
  mapping: { preset: 'custom', mappings: [] },
  enabled: true,
  source: 'file',
  trackName: 'A.wav',
  ...overrides,
})

describe('canEnableReplayAudio', () => {
  it('enables a loaded file only when its name matches the session', () => {
    expect(
      canEnableReplayAudio(snapshot(), {
        hasFileBuffer: true,
        currentTrackName: 'A.wav',
        hasLiveAnalyzer: false,
      }),
    ).toBe(true)
    expect(
      canEnableReplayAudio(snapshot(), {
        hasFileBuffer: true,
        currentTrackName: 'B.wav',
        hasLiveAnalyzer: false,
      }),
    ).toBe(false)
  })

  it('restores wiring without acquiring or relabelling a mismatched file', () => {
    const audio = snapshot()
    const writes: string[] = []
    const applied: {
      mapping?: AudioWiringSnapshot['mapping']
      source?: AudioWiringSnapshot['source']
      enabled?: boolean
    } = {}

    applyReplayAudioWiring(
      audio,
      {
        hasFileBuffer: true,
        currentTrackName: 'B.wav',
        hasLiveAnalyzer: false,
      },
      {
        setMapping: (mapping) => {
          writes.push('mapping')
          applied.mapping = mapping
        },
        setSource: (source) => {
          writes.push('source')
          applied.source = source
        },
        setEnabled: (enabled) => {
          writes.push(`enabled:${enabled}`)
          applied.enabled = enabled
        },
      },
    )

    expect(applied.mapping).toEqual(audio.mapping)
    expect(applied.mapping).not.toBe(audio.mapping)
    expect(applied.source).toBe('file')
    expect(applied.enabled).toBe(false)
    expect(writes).toEqual(['enabled:false', 'mapping', 'source'])
  })

  it('keeps file reactivity off when no buffer is loaded', () => {
    expect(
      canEnableReplayAudio(snapshot(), {
        hasFileBuffer: false,
        currentTrackName: 'A.wav',
        hasLiveAnalyzer: false,
      }),
    ).toBe(false)
  })

  it('never treats a missing recorded file identity as a wildcard', () => {
    expect(
      canEnableReplayAudio(snapshot({ trackName: undefined }), {
        hasFileBuffer: true,
        currentTrackName: 'some-other-track.wav',
        hasLiveAnalyzer: false,
      }),
    ).toBe(false)
  })

  it('requires an existing live analyzer for microphone replay', () => {
    const mic = snapshot({ source: 'mic', trackName: undefined })
    expect(
      canEnableReplayAudio(mic, {
        hasFileBuffer: false,
        hasLiveAnalyzer: false,
      }),
    ).toBe(false)
    expect(
      canEnableReplayAudio(mic, {
        hasFileBuffer: false,
        hasLiveAnalyzer: true,
      }),
    ).toBe(true)
  })
})

describe('replaySessionInstant', () => {
  it('clears transient UI before opening the batch and loading the baseline', () => {
    const events: string[] = []
    const result = replaySessionInstant(
      {
        version: SESSION_FORMAT_VERSION,
        app: { version: 'test', flameSchemaVersion: '1.0' },
        createdAt: new Date(0).toISOString(),
        initial: examples.example1,
        actions: [{ t: 0, id: 'flame.setGamma', args: [1.5] }],
        unnamedWriteCount: 0,
      },
      {
        primeEffects: () => events.push('prime'),
        prepare: () => events.push('prepare'),
        beginBatch: () => events.push('begin'),
        loadInitial: () => events.push('load'),
        execute: () => {
          events.push('execute')
          return true
        },
        endBatch: () => events.push('end'),
      },
    )

    expect(result).toBe(true)
    expect(events).toEqual([
      'prime',
      'prepare',
      'begin',
      'load',
      'execute',
      'end',
    ])
  })

  it('detects only validated snapshots that may enable sonification', () => {
    const base = {
      version: SESSION_FORMAT_VERSION,
      app: { version: 'test', flameSchemaVersion: '1.0' },
      createdAt: new Date(0).toISOString(),
      initial: examples.example1,
      unnamedWriteCount: 0,
    } as const
    const enabled: SonificationSnapshot = {
      version: SONIFICATION_SNAPSHOT_VERSION,
      enabled: true,
      config: {
        model: 'ambient',
        volume: 0.3,
        updateRate: 20,
        scale: 'pentatonicMajor',
        voiceCount: 8,
        harmonicDensity: 1,
        triggerRate: 4,
        spatialSpread: 0.7,
        reverbMix: 0.3,
      },
    }

    expect(sessionMayEnableSonification({ ...base, actions: [] })).toBe(false)
    expect(
      sessionMayEnableSonification({
        ...base,
        actions: [{ t: 0, id: 'sonification.setEnabled', args: [enabled] }],
      }),
    ).toBe(true)
    expect(
      sessionMayEnableSonification({
        ...base,
        actions: [
          {
            t: 0,
            id: 'sonification.setEnabled',
            args: [{ ...enabled, version: 999 }],
          },
        ],
      }),
    ).toBe(false)
  })

  it('defers target side effects until a synchronous instant replay settles', () => {
    const events: string[] = []
    const result = replaySessionInstant(
      {
        version: SESSION_FORMAT_VERSION,
        app: { version: 'test', flameSchemaVersion: '1.0' },
        createdAt: new Date(0).toISOString(),
        initial: examples.example1,
        actions: [
          { t: 0, id: 'sonification.setEnabled', args: [{ enabled: true }] },
          { t: 1, id: 'sonification.setEnabled', args: [{ enabled: false }] },
        ],
        unnamedWriteCount: 0,
      },
      {
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
      },
    )

    expect(result).toBe(true)
    expect(events).toEqual([
      'defer:start',
      'load',
      'execute',
      'execute',
      'defer:end',
    ])
  })

  it('loads view before an optional sonification baseline and then actions', () => {
    const events: string[] = []
    const initialSonification: SonificationSnapshot = {
      version: SONIFICATION_SNAPSHOT_VERSION,
      enabled: true,
      config: {
        model: 'percussive' as const,
        volume: 0.4,
        updateRate: 20,
        scale: 'chromatic' as const,
        voiceCount: 8,
        harmonicDensity: 1,
        triggerRate: 8,
        spatialSpread: 0.6,
        reverbMix: 0.25,
      },
    }

    const result = replaySessionInstant(
      {
        version: SESSION_FORMAT_VERSION,
        app: { version: 'test', flameSchemaVersion: '1.0' },
        createdAt: new Date(0).toISOString(),
        initial: examples.example1,
        initialView: {
          qualityPreset: 'mid',
          adaptiveFilter: false,
          stochasticFilter: false,
          flyMode: false,
          showTimeline: true,
          sidebarOpen: false,
        },
        initialSonification,
        actions: [{ t: 0, id: 'flame.setGamma', args: [1.5] }],
        unnamedWriteCount: 0,
      },
      {
        loadInitial: () => events.push('flame'),
        loadView: (view) => {
          events.push(`view:${view.sidebarOpen ? 'open' : 'closed'}`)
        },
        loadSonification: (snapshot) => {
          events.push(`sonification:${snapshot.config.model}`)
        },
        execute: () => {
          events.push('execute')
          return true
        },
      },
    )

    expect(result).toBe(true)
    expect(events).toEqual([
      'flame',
      'view:closed',
      'sonification:percussive',
      'execute',
    ])
  })

  it('leaves target sonification untouched for a legacy session', () => {
    let sonificationLoads = 0
    const result = replaySessionInstant(
      {
        version: SESSION_FORMAT_VERSION,
        app: { version: 'test', flameSchemaVersion: '1.0' },
        createdAt: new Date(0).toISOString(),
        initial: examples.example1,
        actions: [],
        unnamedWriteCount: 0,
      },
      {
        loadInitial: () => undefined,
        loadSonification: () => {
          sonificationLoads++
        },
        execute: () => true,
      },
    )

    expect(result).toBe(true)
    expect(sonificationLoads).toBe(0)
  })
})
