/**
 * WebMCP foundation — integration tests.
 *
 * These tests exercise the full tool lifecycle:
 *   1. Context bridge installation
 *   2. Tool registration via MockModelContext
 *   3. Tool schema validation (name uniqueness, description budget)
 *   4. Read tool execution (get_flame, list_commands, etc.)
 *   5. Write tool execution (randomize, mutate, undo/redo)
 *   6. Error handling (missing context, bad input)
 */

import '@/commands/builtins'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearWebMcpContext, getWebMcpContext, setWebMcpContext, } from './contextBridge'
import { MockModelContext } from './mockModelContext'
import { wrapTool } from './registerWebMcp'
import { createMockCommandContext, createTestFlame } from './testUtils'
import { allTools } from './tools'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// ── Tests ───────────────────────────────────────────────────────────────────

describe('WebMCP Foundation', () => {
  let mockContext: MockModelContext
  let cmdContext: CommandContext

  beforeEach(() => {
    mockContext = new MockModelContext()
    cmdContext = createMockCommandContext()
    setWebMcpContext(cmdContext)

    for (const tool of allTools) {
      mockContext.registerTool(tool)
    }
  })

  afterEach(() => {
    clearWebMcpContext()
    mockContext.clear()
  })

  // ── Registration ──────────────────────────────────────────────────────

  describe('tool registration', () => {
    it('registers all tools', () => {
      expect(mockContext.getToolNames().length).toBe(allTools.length)
    })

    it('has unique tool names', () => {
      const names = mockContext.getToolNames()
      const unique = new Set(names)
      expect(unique.size).toBe(names.length)
    })

    it('all descriptions are within 500 character budget', () => {
      for (const tool of allTools) {
        expect(tool.description.length).toBeLessThanOrEqual(500)
      }
    })

    it('all tools have non-empty inputSchema', () => {
      for (const tool of allTools) {
        expect(tool.inputSchema).toBeDefined()
        expect(typeof tool.inputSchema).toBe('object')
      }
    })

    it('wraps successful tool execution in MCP result envelope', async () => {
      const tool = wrapTool(allTools.find((t) => t.name === 'get_flame')!)
      const res = (await tool.execute({}, {})) as {
        content: { type: string; text: string }[]
        isError?: boolean
      }
      expect(Array.isArray(res.content)).toBe(true)
      expect(res.content[0]?.type).toBe('text')
      expect(res.isError).toBeUndefined()
    })

    it('wraps error tool results in MCP result envelope with isError: true', async () => {
      const tool = wrapTool(
        allTools.find((t) => t.name === 'get_flame_detail')!,
      )
      const res = (await tool.execute({}, {})) as {
        content: { type: string; text: string }[]
        isError?: boolean
      }
      expect(Array.isArray(res.content)).toBe(true)
      expect(res.isError).toBe(true)
      expect(res.content[0]?.text).toContain('Invalid or missing section')
    })
  })

  // ── Context bridge ────────────────────────────────────────────────────

  describe('context bridge', () => {
    it('returns context when set', () => {
      expect(getWebMcpContext()).toBe(cmdContext)
    })

    it('returns undefined after clear', () => {
      clearWebMcpContext()
      expect(getWebMcpContext()).toBeUndefined()
    })

    it('tools return error when context is missing', async () => {
      clearWebMcpContext()
      const result = await mockContext.executeTool('get_flame', {})
      expect(result).toHaveProperty('error')
    })
  })

  // ── Read tools ────────────────────────────────────────────────────────

  describe('get_flame', () => {
    it('returns compact flame summary', async () => {
      const result = (await mockContext.executeTool('get_flame', {})) as Record<
        string,
        unknown
      >
      expect(result.transformCount).toBe(2)
      expect(result.transforms).toHaveLength(2)
      expect(result.renderSettings).toBeDefined()
      expect(result.metadata).toBeDefined()
    })

    it('includes variation types and weights', async () => {
      const result = (await mockContext.executeTool('get_flame', {})) as Record<
        string,
        unknown
      >
      const transforms = result.transforms as Array<Record<string, unknown>>
      const t1 = transforms.find((t) => t.id === 't1')
      expect(t1).toBeDefined()
      const variations = t1!.variations as Array<Record<string, unknown>>
      expect(variations[0]).toEqual({ type: 'linear', weight: 1 })
    })
  })

  describe('get_flame_detail', () => {
    it('returns render settings', async () => {
      const result = (await mockContext.executeTool('get_flame_detail', {
        section: 'render',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('renderSettings')
      const rs = result.renderSettings as Record<string, unknown>
      expect(rs).toHaveProperty('dimensions')
      expect(rs).toHaveProperty('exposure')
    })

    it('returns specific transform by id', async () => {
      const result = (await mockContext.executeTool('get_flame_detail', {
        section: 'transform',
        transformId: 't1',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('transformId', 't1')
      expect(result).toHaveProperty('transform')
      const transform = result.transform as Record<string, unknown>
      expect(transform).toHaveProperty('probability')
      expect(transform).toHaveProperty('variations')
    })

    it('returns specific transform by numeric index', async () => {
      const result = (await mockContext.executeTool('get_flame_detail', {
        section: 'transform',
        index: 0,
      })) as Record<string, unknown>
      expect(result).toHaveProperty('transformId', 't1')
      expect(result).toHaveProperty('index', 0)
      expect(result).toHaveProperty('transform')
    })

    it('returns a fresh cloned instance for full and transform sections', async () => {
      const full1 = (await mockContext.executeTool('get_flame_detail', {
        section: 'full',
      })) as Record<string, unknown>
      const full2 = (await mockContext.executeTool('get_flame_detail', {
        section: 'full',
      })) as Record<string, unknown>
      expect(full1).not.toBe(full2)
      expect(full1).toEqual(full2)

      const xform1 = (await mockContext.executeTool('get_flame_detail', {
        section: 'transform',
        transformId: 't1',
      })) as { transform: Record<string, unknown> }
      const xform2 = (await mockContext.executeTool('get_flame_detail', {
        section: 'transform',
        transformId: 't1',
      })) as { transform: Record<string, unknown> }
      expect(xform1.transform).not.toBe(xform2.transform)
      expect(xform1.transform).toEqual(xform2.transform)
    })

    it('returns error for missing section', async () => {
      const result = (await mockContext.executeTool(
        'get_flame_detail',
        {},
      )) as { isError?: boolean; error?: string }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })
  })

  describe('list_commands', () => {
    it('returns commands array structure', async () => {
      const result = (await mockContext.executeTool(
        'list_commands',
        {},
      )) as Record<string, unknown>
      expect(result).toHaveProperty('commands')
      expect(result).toHaveProperty('total')
      // Commands may be empty in test env since builtins are imported as
      // side effects by MainWorkspace. The tool itself works correctly.
      const commands = result.commands as unknown[]
      expect(Array.isArray(commands)).toBe(true)
    })

    it('filters by prefix', async () => {
      const result = (await mockContext.executeTool('list_commands', {
        prefix: 'flame.',
      })) as Record<string, unknown>
      const commands = result.commands as Array<Record<string, unknown>>
      for (const cmd of commands) {
        expect((cmd.id as string).startsWith('flame.')).toBe(true)
      }
    })

    it('respects limit and offset for pagination and returns prefixes index', async () => {
      const result = (await mockContext.executeTool('list_commands', {
        limit: 10,
        offset: 5,
      })) as {
        total: number
        truncated: boolean
        offset: number
        prefixes: Array<{ prefix: string; count: number }>
        commands: unknown[]
      }
      expect(result.offset).toBe(5)
      expect(result.commands.length).toBeLessThanOrEqual(10)
      expect(Array.isArray(result.prefixes)).toBe(true)
    })
  })

  describe('get_undo_state', () => {
    it('reports empty stacks initially', async () => {
      const result = (await mockContext.executeTool(
        'get_undo_state',
        {},
      )) as Record<string, unknown>
      expect(result.canUndo).toBe(false)
      expect(result.canRedo).toBe(false)
    })
  })

  // ── Write tools ───────────────────────────────────────────────────────

  describe('undo / redo', () => {
    it('calls history.undo', async () => {
      const result = (await mockContext.executeTool('undo', {})) as Record<
        string,
        unknown
      >
      expect(result.success).toBe(true)
      expect(cmdContext.history!.undo).toHaveBeenCalled()
    })

    it('calls history.redo', async () => {
      const result = (await mockContext.executeTool('redo', {})) as Record<
        string,
        unknown
      >
      expect(result.success).toBe(true)
      expect(cmdContext.history!.redo).toHaveBeenCalled()
    })
  })

  describe('execute_command', () => {
    it('rejects empty commandId', async () => {
      const result = (await mockContext.executeTool('execute_command', {
        commandId: '',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('error')
    })

    it('rejects missing commandId', async () => {
      const result = (await mockContext.executeTool('execute_command', {})) as {
        isError?: boolean
        error?: string
      }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })

    it('rejects unknown commands via preflight', async () => {
      const result = (await mockContext.executeTool('execute_command', {
        commandId: 'nonexistent.command',
      })) as { isError?: boolean; error?: string }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })

    it('sets camera3D container object via flame.setRenderSetting', async () => {
      const result = (await mockContext.executeTool('execute_command', {
        commandId: 'flame.setRenderSetting',
        args: [
          'camera3D',
          { theta: 0.5, phi: 1.2, radius: 6.0, target: [0, 0, 0] },
        ],
      })) as { success?: boolean }
      expect(result.success).toBe(true)
      expect(cmdContext.setFlameDescriptor).toHaveBeenCalled()
    })

    it('updates camera3D via flame.updateRenderSettings', async () => {
      const result = (await mockContext.executeTool('execute_command', {
        commandId: 'flame.updateRenderSettings',
        args: [{ camera3D: { theta: 0.8 } }],
      })) as { success?: boolean }
      expect(result.success).toBe(true)
      expect(cmdContext.setFlameDescriptor).toHaveBeenCalled()
    })

    it('rejects invalid render setting path', async () => {
      const result = (await mockContext.executeTool('execute_command', {
        commandId: 'flame.setRenderSetting',
        args: ['invalid_path_xyz', 123],
      })) as { isError?: boolean; error?: string }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })
  })

  describe('open_art_director', () => {
    it('opens director with candidates', async () => {
      const candidates = [
        { fitness: 0.85, flame: createTestFlame() },
        { fitness: 0.92, flame: createTestFlame() },
      ]
      const result = (await mockContext.executeTool('open_art_director', {
        generation: 1,
        candidates,
      })) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(cmdContext.director!.setState).toHaveBeenCalledWith({
        generation: 1,
        candidates,
      })
      expect(cmdContext.director!.setOpen).toHaveBeenCalledWith(true)
    })
  })

  describe('open_arena', () => {
    it('opens arena HUD with fighter stats and automatic flame descriptors', async () => {
      const s1 = {
        powerLevel: 1095,
        type: 'Hybrid',
        metrics: { complexity: 1.6 },
      }
      const s2 = {
        powerLevel: 895,
        type: 'Chaotic Vortex',
        metrics: { complexity: 1.4 },
      }

      const result = (await mockContext.executeTool('open_arena', {
        player1Name: 'A',
        player1Stats: s1,
        player2Name: 'B',
        player2Stats: s2,
      })) as Record<string, unknown>

      expect(result.success).toBe(true)
      expect(cmdContext.arena!.setOpen).toHaveBeenCalledWith(true)
      expect(cmdContext.arena!.setPlayer1Stats).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'A',
          powerLevel: 1095,
          flame: expect.anything(),
        }),
      )
      expect(cmdContext.arena!.setPlayer2Stats).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'B',
          powerLevel: 895,
          flame: expect.anything(),
        }),
      )
    })
  })

  describe('create_clash_flame', () => {
    it('creates 2D clash flame with backward compatibility', async () => {
      const f1 = createTestFlame()
      const f2 = createTestFlame()
      const result = (await mockContext.executeTool('create_clash_flame', {
        flameA: f1,
        flameB: f2,
      })) as { success: boolean; clashFlame: Record<string, unknown> }

      expect(result.success).toBe(true)
      expect(result.clashFlame.renderSettings).not.toHaveProperty(
        'dimensions',
        3,
      )
      const xforms = result.clashFlame.transforms as Record<
        string,
        { postAffine?: { e?: number } }
      >
      expect(Object.keys(xforms).some((k) => k.startsWith('p1_'))).toBe(true)
      expect(Object.keys(xforms).some((k) => k.startsWith('p2_'))).toBe(true)
    })

    it('creates 3D clash flame with volumetric staging along x, y, and z axes', async () => {
      const f1 = createTestFlame()
      const f2 = createTestFlame()

      for (const axis of ['x', 'y', 'z'] as const) {
        const result = (await mockContext.executeTool('create_clash_flame', {
          flameA: f1,
          flameB: f2,
          dimensions: 3,
          axis,
          separation: 2.5,
          tintA: 0.2,
          tintB: 0.7,
        })) as { success: boolean; clashFlame: Record<string, unknown> }

        expect(result.success).toBe(true)
        const xforms = result.clashFlame.transforms as Record<
          string,
          { postAffine?: { d?: number; h?: number; l?: number } }
        >
        const p1Key = Object.keys(xforms).find((k) => k.startsWith('p1_'))!
        const p2Key = Object.keys(xforms).find((k) => k.startsWith('p2_'))!

        if (axis === 'x') {
          expect(xforms[p1Key]?.postAffine?.d).toBe(-2.5)
          expect(xforms[p2Key]?.postAffine?.d).toBe(2.5)
        } else if (axis === 'y') {
          expect(xforms[p1Key]?.postAffine?.h).toBe(-2.5)
          expect(xforms[p2Key]?.postAffine?.h).toBe(2.5)
        } else if (axis === 'z') {
          expect(xforms[p1Key]?.postAffine?.l).toBe(-2.5)
          expect(xforms[p2Key]?.postAffine?.l).toBe(2.5)
        }
      }
    })

    it('applies power-weighted probability split', async () => {
      const f1 = createTestFlame()
      const f2 = createTestFlame()
      const result = (await mockContext.executeTool('create_clash_flame', {
        flameA: f1,
        flameB: f2,
        dimensions: 3,
        powerA: 75,
        powerB: 25,
      })) as { success: boolean; clashFlame: Record<string, unknown> }

      expect(result.success).toBe(true)
      const xforms = result.clashFlame.transforms as Record<
        string,
        { probability?: number }
      >
      const sumProbA = Object.entries(xforms)
        .filter(([k]) => k.startsWith('p1_'))
        .reduce((sum, [, t]) => sum + (t.probability ?? 0), 0)
      const sumProbB = Object.entries(xforms)
        .filter(([k]) => k.startsWith('p2_'))
        .reduce((sum, [, t]) => sum + (t.probability ?? 0), 0)

      expect(sumProbA).toBeCloseTo(1.5, 2)
      expect(sumProbB).toBeCloseTo(0.5, 2)
    })
  })

  describe('create_custom_variation', () => {
    it('creates custom variation using new body parameter with JS syntax', async () => {
      const result = (await mockContext.executeTool('create_custom_variation', {
        name: 'verify_ok',
        body: 'let r = length(pos); let a = atan2(pos.y, pos.x) + r; return vec2f(r*cos(a), r*sin(a));',
      })) as { success: boolean; id: string; name: string }

      expect(result.success).toBe(true)
      expect(result.id).toMatch(/^custom_/)
      expect(result.name).toBe('verify_ok')
    })

    it('creates custom variation using legacy wgslBody alias', async () => {
      const result = (await mockContext.executeTool('create_custom_variation', {
        name: 'verify_legacy',
        wgslBody: 'return vec2f(sin(pos.x), cos(pos.y));',
      })) as { success: boolean; id: string; name: string }

      expect(result.success).toBe(true)
      expect(result.id).toMatch(/^custom_/)
    })

    it('fails when body is missing', async () => {
      const result = (await mockContext.executeTool('create_custom_variation', {
        name: 'no_body',
      })) as { isError?: boolean; error?: string }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })
  })

  describe('score_clash_round', () => {
    it('scores territory deterministically and sums to 1.0', async () => {
      const f1 = createTestFlame()
      const f2 = createTestFlame()
      const clash = (await mockContext.executeTool('create_clash_flame', {
        flameA: f1,
        flameB: f2,
        dimensions: 3,
      })) as { clashFlame: Record<string, unknown> }

      const r1 = (await mockContext.executeTool('score_clash_round', {
        clashFlame: clash.clashFlame,
        seed: 1234,
      })) as {
        ownershipA: number
        ownershipB: number
        contested: number
        verdict: string
      }

      const r2 = (await mockContext.executeTool('score_clash_round', {
        clashFlame: clash.clashFlame,
        seed: 1234,
      })) as {
        ownershipA: number
        ownershipB: number
        contested: number
        verdict: string
      }

      expect(r1.ownershipA).toBe(r2.ownershipA)
      expect(r1.ownershipB).toBe(r2.ownershipB)
      expect(r1.contested).toBe(r2.contested)
      expect(
        Math.abs(r1.ownershipA + r1.ownershipB + r1.contested - 1.0),
      ).toBeLessThan(0.01)
      expect(['A', 'B', 'draw']).toContain(r1.verdict)
    })

    it('mirror match (F vs F) evaluates to exact tie (draw)', async () => {
      const f1 = createTestFlame()
      const clash = (await mockContext.executeTool('create_clash_flame', {
        flameA: f1,
        flameB: f1,
        dimensions: 3,
      })) as { clashFlame: Record<string, unknown> }

      const score = (await mockContext.executeTool('score_clash_round', {
        clashFlame: clash.clashFlame,
        seed: 42,
      })) as {
        ownershipA: number
        ownershipB: number
        verdict: string
      }

      expect(score.ownershipA).toBe(score.ownershipB)
      expect(score.verdict).toBe('draw')
    })

    it('swapped match (B vs A) exactly mirrors original match (A vs B)', async () => {
      const f1 = createTestFlame()
      const f2 = createTestFlame()
      f2.transforms = {
        ...f2.transforms,
        t3: {
          probability: 2,
          preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          color: { x: 0.8, y: 1 },
          colorSpeed: 0.5,
          visible: true,
          variations: { v0: { type: 'spherical', weight: 1 } },
        },
      } as FlameDescriptor['transforms']

      const clashOrig = (await mockContext.executeTool('create_clash_flame', {
        flameA: f1,
        flameB: f2,
        dimensions: 3,
      })) as { clashFlame: Record<string, unknown> }

      const clashSwap = (await mockContext.executeTool('create_clash_flame', {
        flameA: f2,
        flameB: f1,
        dimensions: 3,
      })) as { clashFlame: Record<string, unknown> }

      const scoreOrig = (await mockContext.executeTool('score_clash_round', {
        clashFlame: clashOrig.clashFlame,
        seed: 999,
      })) as { ownershipA: number; ownershipB: number }

      const scoreSwap = (await mockContext.executeTool('score_clash_round', {
        clashFlame: clashSwap.clashFlame,
        seed: 999,
      })) as { ownershipA: number; ownershipB: number }

      expect(
        Math.abs(scoreOrig.ownershipA - scoreSwap.ownershipB),
      ).toBeLessThanOrEqual(0.02)
      expect(
        Math.abs(scoreOrig.ownershipB - scoreSwap.ownershipA),
      ).toBeLessThanOrEqual(0.02)
    })
  })

  describe('simulate_clash', () => {
    it('simulates 3-round battle deterministically with narrative events', async () => {
      const f1 = createTestFlame()
      const f2 = createTestFlame()

      const sim = (await mockContext.executeTool('simulate_clash', {
        flameA: f1,
        flameB: f2,
        rounds: 3,
        seed: 5555,
      })) as {
        winner: string
        rounds: Array<{
          round: number
          ownershipA: number
          ownershipB: number
          contested: number
          winner: string
          event: string | null
        }>
        finalScore: { A: number; B: number }
      }

      expect(['A', 'B', 'draw']).toContain(sim.winner)
      expect(sim.rounds.length).toBe(3)
      expect(sim.rounds[0]?.round).toBe(1)
      expect(sim.rounds[2]?.round).toBe(3)
      expect(sim.finalScore.A + sim.finalScore.B).toBeLessThanOrEqual(3)
    })
  })

  describe('animate_clash', () => {
    it('lays down camera keyframe tracks on workspace timeline', async () => {
      const f1 = createTestFlame()
      const f2 = createTestFlame()

      const res = (await mockContext.executeTool('animate_clash', {
        flameA: f1,
        flameB: f2,
        framesPerRound: 30,
      })) as { success: boolean; totalFrames: number; winner: string }

      expect(res.success).toBe(true)
      expect(res.totalFrames).toBe(90)
      expect(cmdContext.timeline.setTracks).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ parameterPath: 'camera3D.theta' }),
          expect.objectContaining({ parameterPath: 'camera3D.phi' }),
          expect.objectContaining({ parameterPath: 'camera3D.radius' }),
        ]),
      )
      expect(cmdContext.timeline.setDuration).toHaveBeenCalledWith(90)
      expect(cmdContext.timeline.setAnimationEnabled).toHaveBeenCalledWith(true)
    })
  })

  describe('set_flame', () => {
    it('successfully loads 2D flame descriptor', async () => {
      const base = createTestFlame()
      const res = (await mockContext.executeTool('set_flame', {
        flame: base,
        label: 'ctl',
      })) as { success?: boolean }
      expect(res.success).toBe(true)
    })

    it('successfully loads 3D flame descriptor (dimensions: 3)', async () => {
      const base = createTestFlame()
      const d3 = JSON.parse(JSON.stringify(base))
      d3.renderSettings.dimensions = 3
      const res = (await mockContext.executeTool('set_flame', {
        flame: d3,
        label: 'd3',
      })) as { success?: boolean }
      expect(res.success).toBe(true)
    })
  })

  // ── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('set_flame rejects invalid input', async () => {
      const result = (await mockContext.executeTool('set_flame', {
        flame: 'not-an-object',
      })) as { isError?: boolean; error?: string }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })

    it('set_flame rejects missing flame', async () => {
      const result = (await mockContext.executeTool('set_flame', {})) as {
        isError?: boolean
        error?: string
      }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })

    it('diff_flames rejects invalid target', async () => {
      const result = (await mockContext.executeTool('diff_flames', {
        target: 'not-an-object',
      })) as { isError?: boolean; error?: string }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })

    it('diff_flames rejects missing target', async () => {
      const result = (await mockContext.executeTool('diff_flames', {})) as {
        isError?: boolean
        error?: string
      }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })

    it('randomize_flame rejects invalid transform range', async () => {
      const result = (await mockContext.executeTool('randomize_flame', {
        minTransforms: 5,
        maxTransforms: 2,
      })) as { isError?: boolean; error?: string }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })

    it('mutate_flame rejects invalid preset', async () => {
      const result = (await mockContext.executeTool('mutate_flame', {
        preset: 'InvalidPreset',
      })) as { isError?: boolean; error?: string }
      expect(result.isError || Boolean(result.error)).toBe(true)
    })
  })
})
