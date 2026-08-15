import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { applyReplayAudioWiring, canEnableReplayAudio, replaySessionInstant, } from './replay'
import { SESSION_FORMAT_VERSION } from './schema'
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
    expect(events).toEqual(['prepare', 'begin', 'load', 'execute', 'end'])
  })
})
