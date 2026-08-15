import './sonification'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { executeCommand, executeReplayCommand } from '@/commands/registry'
import { examples } from '@/flame/examples'
import { breakRecordingCoalescing, cancelSessionRecording, startSessionRecording, stopSessionRecording, } from '@/recorder/recorder'
import { closeAuthoredSonificationPanel, SONIFICATION_SNAPSHOT_VERSION, } from '@/recorder/sonificationState'
import type { CommandContext } from '../types'
import type { SonificationSnapshot } from '@/recorder/sonificationState'
import type { SonificationConfig } from '@/utils/sonification'

const config = (
  overrides: Partial<SonificationConfig> = {},
): SonificationConfig => ({
  model: 'orchestral',
  volume: 0.3,
  updateRate: 20,
  scale: 'pentatonicMajor',
  voiceCount: 8,
  harmonicDensity: 1,
  triggerRate: 4,
  spatialSpread: 0.7,
  reverbMix: 0.3,
  ...overrides,
})

function sonificationContext(
  initial: SonificationSnapshot = {
    version: SONIFICATION_SNAPSHOT_VERSION,
    enabled: false,
    config: config(),
  },
) {
  const [enabled, setEnabled] = createSignal(initial.enabled)
  const [currentConfig, setConfig] = createSignal(initial.config)
  const snapshot = (): SonificationSnapshot => ({
    version: SONIFICATION_SNAPSHOT_VERSION,
    enabled: enabled(),
    config: currentConfig(),
  })
  const ctx = {
    sonification: { snapshot, setEnabled, setConfig },
  } as unknown as CommandContext
  return { ctx, snapshot }
}

describe('sonification recorder commands', () => {
  afterEach(cancelSessionRecording)

  it('records explicit enable as a complete versioned snapshot', () => {
    const target = sonificationContext()
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })

    executeCommand('sonification.setEnabled', target.ctx, true)
    const session = stopSessionRecording()

    expect(target.snapshot().enabled).toBe(true)
    expect(session?.actions).toMatchObject([
      {
        id: 'sonification.setEnabled',
        args: [{ version: SONIFICATION_SNAPSHOT_VERSION, enabled: true }],
        label: 'Enable sonification',
        focus: 'param:sonification.enabled',
      },
    ])
  })

  it('records one stop before a user closes or switches the live panel', () => {
    const source = sonificationContext({
      version: SONIFICATION_SNAPSHOT_VERSION,
      enabled: true,
      config: config(),
    })
    const hideStates: boolean[] = []
    expect(
      startSessionRecording(examples.example1, {
        sonification: source.snapshot(),
      }),
    ).toEqual({ ok: true })

    const closePanel = () => {
      closeAuthoredSonificationPanel({
        shouldDisable: () => source.snapshot().enabled,
        disable: () => {
          executeCommand('sonification.setEnabled', source.ctx, false)
        },
        hide: () => hideStates.push(source.snapshot().enabled),
      })
    }
    closePanel()
    // A second dismissal (for example the visibility safety effect settling)
    // must not emit another authored stop.
    closePanel()

    const session = stopSessionRecording()
    expect(hideStates).toEqual([false, false])
    expect(session?.actions).toHaveLength(1)
    expect(session?.actions).toMatchObject([
      {
        id: 'sonification.setEnabled',
        args: [{ enabled: false }],
        label: 'Disable sonification',
      },
    ])

    const replayTarget = sonificationContext({
      version: SONIFICATION_SNAPSHOT_VERSION,
      enabled: true,
      config: config({ model: 'ambient' }),
    })
    for (const action of session?.actions ?? []) {
      expect(
        executeReplayCommand(action.id, replayTarget.ctx, ...action.args),
      ).toBe(true)
    }
    expect(replayTarget.snapshot()).toEqual({
      version: SONIFICATION_SNAPSHOT_VERSION,
      enabled: false,
      config: config(),
    })
  })

  it('records semantic config controls and folds only one slider gesture', () => {
    const target = sonificationContext()
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })

    for (const volume of [0.4, 0.5, 0.6]) {
      executeCommand(
        'sonification.setConfig',
        target.ctx,
        config({ volume }),
        'volume',
      )
    }
    breakRecordingCoalescing()
    executeCommand(
      'sonification.setConfig',
      target.ctx,
      config({ volume: 0.7 }),
      'volume',
    )
    executeCommand(
      'sonification.setConfig',
      target.ctx,
      config({ volume: 0.7, model: 'ambient' }),
      'model',
    )

    const session = stopSessionRecording()
    expect(session?.actions).toHaveLength(3)
    expect(session?.actions[0]).toMatchObject({
      id: 'sonification.setConfig',
      args: [{ config: { volume: 0.6 } }, 'volume'],
      label: 'Sonification volume: 60%',
      focus: 'param:sonification.volume',
    })
    expect(session?.actions[1]?.args).toMatchObject([
      { config: { volume: 0.7 } },
      'volume',
    ])
    expect(session?.actions[2]).toMatchObject({
      args: [{ config: { model: 'ambient' } }, 'model'],
      label: 'Sonification model: ambient',
    })
  })

  it('replays a bounded snapshot and rejects malformed engine state', () => {
    const target = sonificationContext()
    const next: SonificationSnapshot = {
      version: SONIFICATION_SNAPSHOT_VERSION,
      enabled: true,
      config: config({
        model: 'percussive',
        scale: 'chromatic',
        triggerRate: 12,
        reverbMix: 0.8,
      }),
    }

    expect(
      executeReplayCommand(
        'sonification.setConfig',
        target.ctx,
        next,
        'triggerRate',
      ),
    ).toBe(true)
    expect(target.snapshot()).toEqual(next)

    expect(
      executeReplayCommand(
        'sonification.setConfig',
        target.ctx,
        {
          ...next,
          config: { ...next.config, triggerRate: 1000 },
        },
        'triggerRate',
      ),
    ).toBe(false)
    expect(
      executeReplayCommand('sonification.setEnabled', target.ctx, {
        ...next,
        version: 2,
      }),
    ).toBe(false)
    expect(target.snapshot()).toEqual(next)
  })
})
