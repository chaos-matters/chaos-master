import '@/commands/builtins'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentDriving, drivingState, resetPilot } from '@/arcade/pilot'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { arcadeEndBeats, arcadeGetAudioCatalog, arcadeSetAudioMapping, arcadeStartBeats, } from './arcadeBeats'
import { executeCommandTool } from './executeCommand'
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

  // ALWAYS_ALLOWED used to be spread into BEATS_ALLOWED and then added again
  // by the tool, so a refusal named lesson.note and the sidebar twice.
  it('names each allowed command once when it refuses one', async () => {
    setWebMcpContext(createMockCommandContext())
    await run(arcadeStartBeats, {})
    const refusal = await run(executeCommandTool, {
      commandId: 'flame.setGamma',
      args: [2],
    })
    const listed = String(refusal.error).split('Allowed: ')[1]?.split(', ')
    expect(listed).toContain('lesson.note')
    expect(listed?.filter((id, i) => listed.indexOf(id) !== i)).toEqual([])
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

  describe('track loading', () => {
    const setup = (loadedTrack: string | undefined) => {
      const ctx = createMockCommandContext()
      const audio = ctx.audio!
      audio.snapshot = vi.fn(() => ({
        mapping: { preset: 'custom' as const, mappings: [] },
        enabled: false,
        source: 'file' as const,
        trackName: loadedTrack,
      }))
      audio.canEnable = vi.fn(
        (required) =>
          loadedTrack !== undefined && required.trackName === loadedTrack,
      )
      setWebMcpContext(ctx)
      return { ctx, load: vi.mocked(audio.loadBundledTrack!) }
    }

    it('loads the requested bundled track before recording starts', async () => {
      const { ctx, load } = setup('Ember Drift')

      const result = await run(arcadeStartBeats, { trackName: 'Cyber Pulse' })

      expect(result.ok).toBe(true)
      expect(load).toHaveBeenCalledOnce()
      expect(load.mock.calls[0]?.[0]).toMatchObject({ id: 'cyber-pulse' })
      const start = vi.mocked(ctx.recorder!.start)
      expect(load.mock.invocationCallOrder[0]!).toBeLessThan(
        start.mock.invocationCallOrder[0]!,
      )
    })

    it('switches to the loaded track when the microphone was the source', async () => {
      const { ctx } = setup('Ember Drift')
      const audio = ctx.audio!
      audio.snapshot = vi.fn(() => ({
        mapping: { preset: 'custom' as const, mappings: [] },
        enabled: false,
        source: 'mic' as const,
        trackName: 'Ember Drift',
      }))

      const result = await run(arcadeStartBeats, {})

      expect(result.ok).toBe(true)
      const setSource = vi.mocked(audio.setSource)
      expect(setSource).toHaveBeenCalledWith('file')
      expect(setSource.mock.invocationCallOrder[0]!).toBeLessThan(
        vi.mocked(audio.setEnabled).mock.invocationCallOrder[0]!,
      )
    })

    it('accepts a track id as well as its display name', async () => {
      const { load } = setup(undefined)
      await run(arcadeStartBeats, { trackName: 'cyber-pulse' })
      expect(load.mock.calls[0]?.[0]).toMatchObject({ name: 'Cyber Pulse' })
    })

    it('loads the default track when nothing usable is loaded', async () => {
      const { load } = setup(undefined)
      const result = await run(arcadeStartBeats, {})
      expect(result.activeTrack).toBe('Ember Drift')
      expect(load.mock.calls[0]?.[0]).toMatchObject({ id: 'ember-drift' })
    })

    it('keeps a track that is already loaded instead of reloading it', async () => {
      const { load } = setup('Ember Drift')
      await run(arcadeStartBeats, { trackName: 'Ember Drift' })
      await run(arcadeEndBeats, {})
      resetPilot()
      await run(arcadeStartBeats, {})
      expect(load).not.toHaveBeenCalled()
    })

    it('refuses an unknown track and starts nothing', async () => {
      const { ctx, load } = setup(undefined)
      const result = await run(arcadeStartBeats, { trackName: 'Nope' })
      expect(String(result.error)).toContain('Ember Drift')
      expect(load).not.toHaveBeenCalled()
      expect(ctx.recorder?.start).not.toHaveBeenCalled()
      expect(agentDriving()).toBe(false)
    })

    it('starts nothing and reports it when the track fails to load', async () => {
      const { ctx, load } = setup(undefined)
      load.mockRejectedValueOnce(new Error('HTTP 404'))
      const result = await run(arcadeStartBeats, { trackName: 'Cyber Pulse' })
      expect(String(result.error)).toContain('HTTP 404')
      expect(ctx.recorder?.start).not.toHaveBeenCalled()
      expect(agentDriving()).toBe(false)
    })

    it('says whether the mapping actually left reactivity on', async () => {
      const mapping = {
        mappings: [
          {
            audioFeature: 'bass',
            target: { kind: 'renderSetting', param: 'exposure' },
            sensitivity: 1,
            range: [0, 1],
          },
        ],
      }
      setup('Ember Drift')
      await run(arcadeStartBeats, {})
      const on = await run(arcadeSetAudioMapping, mapping)
      expect(on.reactive).toBe(true)

      resetPilot()
      clearWebMcpContext()
      const { ctx } = setup(undefined)
      ctx.audio!.loadBundledTrack = vi.fn(() => Promise.resolve())
      await run(arcadeStartBeats, {})
      const off = await run(arcadeSetAudioMapping, mapping)
      expect(off.reactive).toBe(false)
      expect(String(off.warning)).toMatch(/no audio track|reactivity is off/i)
    })
  })
})
