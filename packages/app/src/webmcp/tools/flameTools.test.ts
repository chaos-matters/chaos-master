/* eslint-disable @typescript-eslint/no-explicit-any */
import '@/commands/builtins'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { executeCommandTool } from './executeCommand'
import { mutateFlame } from './mutateFlame'
import { randomizeFlame } from './randomizeFlame'
import { setFlame } from './setFlame'
import { redo, undo } from './undoRedo'
import type { CommandContext } from '@/commands/types'

function createMockContext(overrides: Partial<CommandContext> = {}): {
  ctx: CommandContext
  flameState: { current: any }
  lastHistoryLabel: { current: string | undefined }
} {
  const flameState = {
    current: {
      version: '1.0',
      metadata: {
        name: 'Test Flame',
        author: 'Test Author',
        description: 'A test descriptor',
      },
      renderSettings: {
        dimensions: 2,
        exposure: 0.5,
        skipIters: 25,
        plotsPerChain: 16,
        drawMode: 'light' as const,
        backgroundColor: [0, 0, 0] as [number, number, number],
        vibrancy: 0.8,
        contrast: 1.2,
        gamma: 2.0,
      },
      transforms: {
        t1: {
          probability: 0.5,
          preAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          color: { x: 0.2, y: 0.8 },
          colorSpeed: 0.5,
          visible: true,
          variations: {
            v1: { type: 'linear', weight: 1.0, visible: true },
          },
        },
      },
    },
  }

  const lastHistoryLabel: { current: string | undefined } = {
    current: undefined,
  }

  const setFlameDescriptor = vi.fn((updater: any, label?: string) => {
    flameState.current =
      typeof updater === 'function' ? updater(flameState.current) : updater
    lastHistoryLabel.current = label
  })

  const ctx: CommandContext = {
    flameDescriptor: () => flameState.current,
    setFlameDescriptor: setFlameDescriptor as any,
    blendFlame: () => undefined,
    setBlendFlame: () => {},
    blendWeight: () => 0,
    setBlendWeight: () => {},
    pixelRatio: () => 1,
    setPixelRatio: () => {},
    zoom: () => 1,
    setZoom: () => {},
    position: () => ({ x: 0, y: 0 }) as any,
    setPosition: () => {},
    sidebar: { open: () => false, setOpen: () => {} },
    timeline: {
      tracks: () => [],
      setTracks: () => {},
      animationEnabled: () => false,
      setAnimationEnabled: () => {},
      duration: () => 90,
      setDuration: () => {},
      currentFrame: () => 0,
      setCurrentFrame: () => {},
      play: () => {},
      setLoop: () => {},
      setFps: () => {},
      addKeyframe: () => {},
    },
    camera: { center: () => {} },
    modal: { open: () => {} },
    history: {
      undo: vi.fn(),
      redo: vi.fn(),
      peekUndoTarget: vi.fn(() => ({ system: 'flame', seq: 1 })),
      peekRedoTarget: vi.fn(() => undefined),
    },
    ...overrides,
  }

  return { ctx, flameState, lastHistoryLabel }
}

describe('WebMCP Flame Tools', () => {
  beforeEach(() => {
    clearWebMcpContext()
  })

  describe('context bridge check', () => {
    it('returns standard error when context is missing', () => {
      const tools = [
        setFlame,
        randomizeFlame,
        mutateFlame,
        executeCommandTool,
        undo,
        redo,
      ]
      for (const tool of tools) {
        const result = tool.execute({}, {}) as { error?: string }
        expect(result).toHaveProperty('error')
        expect(result.error).toBe(
          'Workspace not ready. The flame editor has not finished loading.',
        )
      }
    })
  })

  describe('setFlame', () => {
    it('loads a valid flame descriptor with default label', () => {
      const { ctx, flameState, lastHistoryLabel } = createMockContext()
      setWebMcpContext(ctx)

      const validFlame = {
        version: '1.0',
        metadata: { name: 'New Flame', description: 'Updated' },
        renderSettings: { dimensions: 2, exposure: 1.0, skipIters: 20 },
        transforms: {
          tA: {
            probability: 1.0,
            preAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
            postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
            color: { x: 0.5, y: 0.5 },
            colorSpeed: 0.5,
            visible: true,
            variations: {
              v1: { type: 'linear', weight: 1.0, visible: true },
            },
          },
        },
      }

      const res = setFlame.execute({ flame: validFlame }, {}) as any
      expect(res).toEqual({ success: true })
      expect(flameState.current.metadata.name).toBe('New Flame')
      expect(lastHistoryLabel.current).toBe('WebMCP: Set Flame')
    })

    it('loads with custom history label', () => {
      const { ctx, lastHistoryLabel } = createMockContext()
      setWebMcpContext(ctx)

      const validFlame = {
        version: '1.0',
        renderSettings: { dimensions: 2, exposure: 0.5, skipIters: 20 },
        transforms: {
          tA: {
            probability: 1.0,
            preAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
            postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
            color: { x: 0, y: 0 },
            colorSpeed: 0.5,
            visible: true,
            variations: {
              v1: { type: 'linear', weight: 1.0, visible: true },
            },
          },
        },
      }

      const res = setFlame.execute(
        { flame: validFlame, label: 'Custom Undo Label' },
        {},
      ) as any
      expect(res).toEqual({ success: true })
      expect(lastHistoryLabel.current).toBe('Custom Undo Label')
    })

    it('rejects invalid input without flame property', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = setFlame.execute({}, {}) as any
      expect(res.error).toContain(
        'Invalid input: "flame" object property is required.',
      )
    })

    it('rejects invalid flame schema', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = setFlame.execute({ flame: { invalid: true } }, {}) as any
      expect(res.error).toContain(
        'Invalid flame descriptor: failed schema validation.',
      )
    })
  })

  describe('randomizeFlame', () => {
    it('generates a random flame with given seed', () => {
      const { ctx, flameState } = createMockContext()
      setWebMcpContext(ctx)

      const res = randomizeFlame.execute(
        { seed: 12345, minTransforms: 2, maxTransforms: 3 },
        {},
      ) as any
      expect(res.success).toBe(true)
      expect(res.seed).toBe(12345)
      expect(
        Object.keys(flameState.current.transforms).length,
      ).toBeGreaterThanOrEqual(2)
      expect(
        Object.keys(flameState.current.transforms).length,
      ).toBeLessThanOrEqual(3)
    })

    it('generates a seed if none provided', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = randomizeFlame.execute({}, {}) as any
      expect(res.success).toBe(true)
      expect(typeof res.seed).toBe('number')
    })

    it('validates ranges', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res1 = randomizeFlame.execute(
        { minTransforms: 5, maxTransforms: 2 },
        {},
      ) as any
      expect(res1.error).toContain('Invalid transform count range')

      const res2 = randomizeFlame.execute(
        { minVariations: 5, maxVariations: 2 },
        {},
      ) as any
      expect(res2.error).toContain('Invalid variation count range')

      const res3 = randomizeFlame.execute({ strength: 1.5 }, {}) as any
      expect(res3.error).toContain('Invalid strength')
    })
  })

  describe('mutateFlame', () => {
    it('mutates the flame deterministically with a seed and preset', () => {
      const { ctx, flameState } = createMockContext()
      setWebMcpContext(ctx)

      const res = mutateFlame.execute(
        { seed: 999, preset: 'Subtle' },
        {},
      ) as any
      expect(res.success).toBe(true)
      expect(res.seed).toBe(999)
      expect(flameState.current).toBeDefined()
    })

    it('validates preset name', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = mutateFlame.execute(
        { preset: 'NonExistentPreset' },
        {},
      ) as any
      expect(res.error).toContain('Invalid preset')
    })
  })

  describe('executeCommandTool', () => {
    it('executes a valid command by ID', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = executeCommandTool.execute(
        { commandId: 'flame.setExposure', args: [0.75] },
        {},
      ) as any
      expect(res).toEqual({ success: true, commandId: 'flame.setExposure' })
    })

    it('rejects missing commandId', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = executeCommandTool.execute({}, {}) as any
      expect(res.error).toContain('commandId" string property is required')
    })

    it('fails preflight for unknown command', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = executeCommandTool.execute(
        { commandId: 'unknown.command', args: [] },
        {},
      ) as any
      expect(res.error).toContain('Unknown replay command')
    })

    it('fails preflight for invalid args', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = executeCommandTool.execute(
        { commandId: 'flame.setExposure', args: ['not-a-number'] },
        {},
      ) as any
      expect(res.error).toBeDefined()
    })
  })

  describe('undo and redo', () => {
    it('calls history undo and returns updated state', () => {
      const { ctx } = createMockContext()
      setWebMcpContext(ctx)

      const res = undo.execute({}, {}) as any
      expect(ctx.history?.undo).toHaveBeenCalled()
      expect(res).toEqual({
        success: true,
        canUndo: true,
        canRedo: false,
        undoTarget: 'flame',
        redoTarget: null,
      })
    })

    it('calls history redo and returns updated state', () => {
      const { ctx } = createMockContext({
        history: {
          undo: vi.fn(),
          redo: vi.fn(),
          peekUndoTarget: vi.fn(() => undefined),
          peekRedoTarget: vi.fn(() => ({ system: 'timeline', seq: 2 })),
        },
      })
      setWebMcpContext(ctx)

      const res = redo.execute({}, {}) as any
      expect(ctx.history?.redo).toHaveBeenCalled()
      expect(res).toEqual({
        success: true,
        canUndo: false,
        canRedo: true,
        undoTarget: null,
        redoTarget: 'timeline',
      })
    })
  })
})
