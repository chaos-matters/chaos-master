import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { breakRecordingCoalescing, cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { canEnableReplayAudio } from '@/recorder/replay'
import type { CommandContext } from '@/commands/types'
import type { AudioWiringSnapshot } from '@/flame/schema/audioWiring'

const wiring = (
  overrides: Partial<AudioWiringSnapshot> = {},
): AudioWiringSnapshot => ({
  mapping: { preset: 'custom', mappings: [] },
  enabled: false,
  source: 'file',
  trackName: 'recorded.wav',
  ...overrides,
})

function audioContext(options: {
  current?: AudioWiringSnapshot
  resourceAvailable: boolean | ((required: AudioWiringSnapshot) => boolean)
}) {
  let current = options.current ?? wiring()
  const ctx = {
    audio: {
      snapshot: () => current,
      canEnable: (required: AudioWiringSnapshot) =>
        typeof options.resourceAvailable === 'function'
          ? options.resourceAvailable(required)
          : options.resourceAvailable,
      setMapping: (mapping: AudioWiringSnapshot['mapping']) => {
        current = { ...current, mapping }
      },
      setEnabled: (enabled: boolean) => {
        current = { ...current, enabled }
      },
      setSource: (source: AudioWiringSnapshot['source']) => {
        current = { ...current, source }
      },
    },
  } as unknown as CommandContext

  return { ctx, current: () => current }
}

describe('audio replay resource identity', () => {
  afterEach(() => {
    cancelSessionRecording()
  })

  it('records enable as a complete wiring snapshot with file identity', () => {
    const target = audioContext({ resourceAvailable: true })
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })

    executeCommand('audio.setEnabled', target.ctx, true)
    const session = stopSessionRecording()

    expect(target.current().enabled).toBe(true)
    expect(session?.actions).toHaveLength(1)
    expect(session?.actions[0]).toMatchObject({
      id: 'audio.setEnabled',
      args: [wiring({ enabled: true })],
    })
  })

  it('records source changes with the required resource identity too', () => {
    const target = audioContext({
      resourceAvailable: true,
      current: wiring({ enabled: true, source: 'mic' }),
    })
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })

    executeCommand('audio.setSource', target.ctx, 'file')
    const session = stopSessionRecording()

    expect(session?.actions[0]).toMatchObject({
      id: 'audio.setSource',
      args: [wiring({ enabled: true, source: 'file' })],
    })
  })

  it('rejects a legacy enable action that recorded no resource identity', () => {
    const target = audioContext({ resourceAvailable: false })

    expect(executeReplayCommand('audio.setEnabled', target.ctx, true)).toBe(
      false,
    )
    expect(target.current().enabled).toBe(false)
  })

  it('does not enable a later recorded audio action without its resource', () => {
    const target = audioContext({
      resourceAvailable: (required) =>
        canEnableReplayAudio(required, {
          hasFileBuffer: true,
          currentTrackName: 'different.wav',
          hasLiveAnalyzer: false,
        }),
    })

    expect(
      executeReplayCommand(
        'audio.setEnabled',
        target.ctx,
        wiring({ enabled: true }),
      ),
    ).toBe(true)
    expect(target.current().enabled).toBe(false)
  })

  it('enables a snapshot only after the workspace authorizes its resource', () => {
    const target = audioContext({ resourceAvailable: true })

    expect(
      executeReplayCommand(
        'audio.setEnabled',
        target.ctx,
        wiring({ enabled: true }),
      ),
    ).toBe(true)
    expect(target.current().enabled).toBe(true)
  })

  it('keeps safe legacy disable/source actions replayable but disabled', () => {
    const target = audioContext({
      resourceAvailable: true,
      current: wiring({ enabled: true }),
    })

    expect(executeReplayCommand('audio.setSource', target.ctx, 'mic')).toBe(
      true,
    )
    expect(target.current()).toMatchObject({ source: 'mic', enabled: false })

    target.ctx.audio?.setEnabled(true)
    expect(executeReplayCommand('audio.setEnabled', target.ctx, false)).toBe(
      true,
    )
    expect(target.current().enabled).toBe(false)
  })

  it('captures upload/clear wiring as a full snapshot action', () => {
    const target = audioContext({
      resourceAvailable: false,
      current: wiring({ enabled: false, trackName: undefined }),
    })
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })

    executeCommand('audio.applySnapshot', target.ctx)
    const session = stopSessionRecording()

    expect(session?.actions).toHaveLength(1)
    expect(session?.actions[0]?.id).toBe('audio.applySnapshot')
    expect(session?.actions[0]?.args).toEqual([
      wiring({ enabled: false, trackName: undefined }),
    ])
  })

  it('keeps discrete wiring edits chronological and folds only one slider gesture', () => {
    const first = {
      audioFeature: 'bass' as const,
      target: { kind: 'renderSetting' as const, param: 'vibrancy' as const },
      sensitivity: 0.5,
      range: [0.5, 1.5] as [number, number],
    }
    const second = {
      audioFeature: 'mid' as const,
      target: { kind: 'renderSetting' as const, param: 'exposure' as const },
      sensitivity: 0.4,
      range: [0.8, 1.4] as [number, number],
    }
    const target = audioContext({
      resourceAvailable: false,
      current: wiring({
        mapping: { preset: 'custom', mappings: [] },
      }),
    })
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })

    executeCommand('audio.setMapping', target.ctx, {
      preset: 'pulse',
      mappings: [first],
    })
    executeCommand('audio.setMapping', target.ctx, {
      preset: 'custom',
      mappings: [first, second],
    })

    breakRecordingCoalescing()
    for (const sensitivity of [0.6, 0.7, 0.8]) {
      executeCommand('audio.setMapping', target.ctx, {
        preset: 'custom',
        mappings: [{ ...first, sensitivity }, second],
      })
    }
    breakRecordingCoalescing()

    const session = stopSessionRecording()
    expect(session?.unnamedWriteCount).toBe(0)
    expect(session?.actions.map((action) => action.id)).toEqual([
      'audio.setMapping',
      'audio.setMapping',
      'audio.setMapping',
    ])
    expect(session?.actions[2]?.args[0]).toMatchObject({
      mapping: {
        mappings: [{ sensitivity: 0.8 }, { sensitivity: 0.4 }],
      },
    })
    expect(session?.actions[2]?.args[1]).toBe('0:sensitivity')
  })
})
