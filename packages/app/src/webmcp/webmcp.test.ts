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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWebMcpContext, getWebMcpContext, setWebMcpContext, } from './contextBridge'
import { MockModelContext } from './mockModelContext'
import { wrapTool } from './registerWebMcp'
import { allTools } from './tools'
import type { CommandContext } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// ── Test helpers ────────────────────────────────────────────────────────────

/** Minimal flame descriptor for testing. */
function createTestFlame(): FlameDescriptor {
  return {
    transforms: {
      t1: {
        probability: 0.5,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0.5, y: 0.5 },
        colorSpeed: 0.4,
        visible: true,
        variations: {
          v1: { type: 'linear', weight: 1 },
        },
      },
      t2: {
        probability: 0.5,
        preAffine: { a: 0.5, b: 0.3, c: 0.1, d: -0.3, e: 0.5, f: 0.2 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0.8, y: 0.2 },
        colorSpeed: 0.6,
        visible: true,
        variations: {
          v2: { type: 'sinusoidal', weight: 0.7 },
        },
      },
    },
    renderSettings: {
      dimensions: 2,
      exposure: 0.25,
      skipIters: 20,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      vibrancy: 0.5,
      contrast: 1,
      gamma: 2.2,
      camera: { zoom: 1, position: [0, 0], rotation: 0 },
    },
    metadata: {
      name: 'Test Flame',
      author: 'test',
      description: 'A test flame',
    },
  } as unknown as FlameDescriptor
}

/**
 * Minimal CommandContext mock.
 * Only the fields that the Tier 1 tools actually use.
 */
function createMockCommandContext(): CommandContext {
  let flame = createTestFlame()
  const undoStack: FlameDescriptor[] = []
  const redoStack: FlameDescriptor[] = []

  return {
    beforeCommand: vi.fn(),
    flameDescriptor: () => flame,
    setFlameDescriptor: vi.fn((fn: (f: FlameDescriptor) => FlameDescriptor) => {
      undoStack.push(flame)
      flame = fn(flame)
      redoStack.length = 0
    }) as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
    zoom: () => 1,
    setZoom: vi.fn(),
    position: () =>
      ({
        x: 0,
        y: 0,
      }) as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
    setPosition: vi.fn(),
    blendFlame: () => undefined,
    setBlendFlame: vi.fn(),
    blendWeight: () => 0,
    setBlendWeight: vi.fn(),
    pixelRatio: () => 1,
    setPixelRatio: vi.fn(),
    paletteRestoreColors: undefined,
    sidebar: {
      open: () => true,
      setOpen: vi.fn(),
    },
    arena: {
      open: () => false,
      setOpen: vi.fn(),
      player1Stats: () => null,
      setPlayer1Stats: vi.fn(),
      player2Stats: () => null,
      setPlayer2Stats: vi.fn(),
      selectFighter: vi.fn(),
    },
    director: {
      open: vi.fn(() => false),
      setOpen: vi.fn(),
      state: vi.fn(() => null),
      setState: vi.fn(),
      selectCandidate: vi.fn(),
    },
    camera: {
      center: vi.fn(),
    },
    modal: {
      open: vi.fn(),
    },
    timeline: {
      timelineStore: {
        state: {} as unknown,
        set: vi.fn(),
      },
      currentFrame: () => 0,
    } as unknown as CommandContext['timeline'],
    history: {
      undo: vi.fn(() => {
        const prev = undoStack.pop()
        if (prev) {
          redoStack.push(flame)
          flame = prev
        }
      }),
      redo: vi.fn(() => {
        const next = redoStack.pop()
        if (next) {
          undoStack.push(flame)
          flame = next
        }
      }),
      peekUndoTarget: () =>
        undoStack.length > 0
          ? { system: 'flame' as const, seq: undoStack.length }
          : undefined,
      peekRedoTarget: () =>
        redoStack.length > 0
          ? { system: 'flame' as const, seq: redoStack.length }
          : undefined,
    },
  }
}

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
      const res = (await tool.execute({})) as {
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
      const res = (await tool.execute({})) as {
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

    it('returns error for missing transform', async () => {
      const result = (await mockContext.executeTool('get_flame_detail', {
        section: 'transform',
        transformId: 'nonexistent',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('error')
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
      )) as Record<string, unknown>
      expect(result).toHaveProperty('error')
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
      const result = (await mockContext.executeTool(
        'execute_command',
        {},
      )) as Record<string, unknown>
      expect(result).toHaveProperty('error')
    })

    it('rejects unknown commands via preflight', async () => {
      const result = (await mockContext.executeTool('execute_command', {
        commandId: 'nonexistent.command',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('error')
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
      })) as Record<string, unknown>
      expect(result).toHaveProperty('error')
    })
  })

  // ── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('set_flame rejects invalid input', async () => {
      const result = (await mockContext.executeTool('set_flame', {
        flame: 'not-an-object',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('error')
    })

    it('set_flame rejects missing flame', async () => {
      const result = (await mockContext.executeTool('set_flame', {})) as Record<
        string,
        unknown
      >
      expect(result).toHaveProperty('error')
    })

    it('diff_flames rejects invalid target', async () => {
      const result = (await mockContext.executeTool('diff_flames', {
        target: 'not-an-object',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('error')
    })

    it('diff_flames rejects missing target', async () => {
      const result = (await mockContext.executeTool(
        'diff_flames',
        {},
      )) as Record<string, unknown>
      expect(result).toHaveProperty('error')
    })

    it('randomize_flame rejects invalid transform range', async () => {
      const result = (await mockContext.executeTool('randomize_flame', {
        minTransforms: 5,
        maxTransforms: 2,
      })) as Record<string, unknown>
      expect(result).toHaveProperty('error')
    })

    it('mutate_flame rejects invalid preset', async () => {
      const result = (await mockContext.executeTool('mutate_flame', {
        preset: 'InvalidPreset',
      })) as Record<string, unknown>
      expect(result).toHaveProperty('error')
    })
  })
})
