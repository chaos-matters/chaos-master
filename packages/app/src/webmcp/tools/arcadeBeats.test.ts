import '@/commands/builtins'
import { afterEach, describe, expect, it } from 'vitest'
import { agentDriving, drivingState, resetPilot } from '@/arcade/pilot'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { arcadeEndBeats, arcadeGetAudioCatalog, arcadeSetAudioMapping, arcadeStartBeats, } from './arcadeBeats'
import type { WebMcpTool } from '@/webmcp/types'

const run = async (tool: WebMcpTool, input: unknown) =>
  (await tool.execute(input, {})) as Record<string, unknown>

describe('arcade beats tools', () => {
  afterEach(() => {
    resetPilot()
    clearWebMcpContext()
  })

  it('refuses without a workspace', async () => {
    expect(await run(arcadeStartBeats, {})).toHaveProperty('error')
    expect(await run(arcadeGetAudioCatalog, {})).toHaveProperty('error')
    expect(await run(arcadeSetAudioMapping, { mappings: [] })).toHaveProperty(
      'error',
    )
    expect(await run(arcadeEndBeats, {})).toHaveProperty('error')
  })

  it('starts beats session: locks editor, starts recorder and enables audio', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    const result = await run(arcadeStartBeats, { trackName: 'Cyber Pulse' })

    expect(result.ok).toBe(true)
    expect(result.stepBudget).toBe(30)
    expect(result.activeTrack).toBe('Cyber Pulse')
    expect(agentDriving()).toBe(true)
    expect(drivingState()?.mode).toBe('beats')
    expect(ctx.recorder?.start).toHaveBeenCalled()
    expect(ctx.arcade?.closeHub).toHaveBeenCalled()
    expect(ctx.audio?.setEnabled).toHaveBeenCalledWith(true)
  })

  it('provides audio catalog with features, presets and flame targets', async () => {
    const ctx = createMockCommandContext()
    ctx.flameDescriptor = () => createTestFlame()
    setWebMcpContext(ctx)

    const catalog = await run(arcadeGetAudioCatalog, {})

    expect(Array.isArray(catalog.features)).toBe(true)
    expect((catalog.features as unknown[]).length).toBeGreaterThanOrEqual(8)
    expect(Array.isArray(catalog.presets)).toBe(true)

    const targets = catalog.targets as Record<string, unknown>
    expect(targets).toBeDefined()
    expect(Array.isArray(targets.renderSettings)).toBe(true)
    expect(Array.isArray(targets.transforms)).toBe(true)

    const currentTrack = catalog.currentTrack as Record<string, unknown>
    expect(currentTrack.name).toBe('Ember Drift')
  })

  it('refuses set_audio_mapping when beats mode is not driving', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    const result = await run(arcadeSetAudioMapping, {
      mappings: [
        {
          audioFeature: 'bass',
          target: { kind: 'renderSetting', param: 'exposure' },
          sensitivity: 1.5,
          range: [0.2, 1.0],
        },
      ],
    })

    expect(result.error).toContain('arcade_start_beats')
  })

  it('applies valid audio mapping and records narration rationale', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    await run(arcadeStartBeats, {})

    const result = await run(arcadeSetAudioMapping, {
      preset: 'pulse',
      mappings: [
        {
          audioFeature: 'bass',
          target: { kind: 'renderSetting', param: 'exposure' },
          sensitivity: 1.5,
          range: [0.2, 1.0],
        },
        {
          audioFeature: 'presence',
          target: { kind: 'renderSetting', param: 'paletteSpeed' },
          sensitivity: 1.0,
          range: [0.1, 0.8],
        },
      ],
      rationale: 'Bass drives exposure pulse, presence drives palette shift',
    })

    expect(result.ok).toBe(true)
    expect(result.appliedCount).toBe(2)
    expect(result.preset).toBe('pulse')
    expect(result.remainingSteps).toBe(29)
  })

  it('rejects malformed mapping structures with helpful error', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    await run(arcadeStartBeats, {})

    const result = await run(arcadeSetAudioMapping, {
      mappings: [
        {
          audioFeature: 'not_a_feature',
          target: { kind: 'renderSetting', param: 'exposure' },
          sensitivity: 1.5,
          range: [0.2, 1.0],
        },
      ],
    })

    expect(result.error).toBeDefined()
    expect(String(result.error)).toContain('Invalid audio mapping structure')
  })

  it('ends beats session and lifts lock', async () => {
    const ctx = createMockCommandContext()
    setWebMcpContext(ctx)

    await run(arcadeStartBeats, {})
    expect(agentDriving()).toBe(true)

    const endResult = await run(arcadeEndBeats, {
      title: 'Cosmic Bass Pulse',
      summary: 'Heavy sub-bass modulation of fractal core',
    })

    expect(endResult.ok).toBe(true)
    expect(endResult.title).toBe('Cosmic Bass Pulse')
    expect(agentDriving()).toBe(false)
  })
})
