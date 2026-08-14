import { describe, expect, it } from 'vitest'
import { applyReplayAudioWiring, canEnableReplayAudio } from './replay'
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
          applied.mapping = mapping
        },
        setSource: (source) => {
          applied.source = source
        },
        setEnabled: (enabled) => {
          applied.enabled = enabled
        },
      },
    )

    expect(applied.mapping).toEqual(audio.mapping)
    expect(applied.mapping).not.toBe(audio.mapping)
    expect(applied.source).toBe('file')
    expect(applied.enabled).toBe(false)
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
