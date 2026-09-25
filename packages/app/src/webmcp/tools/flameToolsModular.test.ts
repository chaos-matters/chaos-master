import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearWebMcpContext, setWebMcpContext } from '@/webmcp/contextBridge'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { formatSummarizedMetadata, formatSummarizedRenderSettings, formatSummarizedTransforms, formatTransformSummary, } from './getFlame'
import { resolveTransformDetail } from './getFlameDetail'
import { mutateFlame } from './mutateFlame'
import { openArena } from './openArena'
import { randomizeFlame } from './randomizeFlame'
import { scoreClashRound } from './scoreClashRound'
import type { TransformFunction } from '@/flame/schema/flameSchema'

describe('getFlame modular subroutines', () => {
  it('formats transform summary correctly', () => {
    const t = {
      probability: 0.8,
      variations: {
        v1: { type: 'linearVar', weight: 1.0 },
      },
      color: { x: 0.2, y: 0.8 },
      colorSpeed: 0.5,
      visible: true,
    } as unknown as TransformFunction

    const summary = formatTransformSummary('t0', t)
    expect(summary.id).toBe('t0')
    expect(summary.probability).toBe(0.8)
    expect(summary.variations).toEqual([{ type: 'linearVar', weight: 1.0 }])
    expect(summary.color).toEqual({ x: 0.2, y: 0.8 })
    expect(summary.colorSpeed).toBe(0.5)
    expect(summary.visible).toBe(true)
  })

  it('formats summarized transforms and tracks truncation', () => {
    const record: Record<string, TransformFunction> = {}
    for (let i = 0; i < 10; i++) {
      record[`t_${i}`] = {
        probability: 1,
        variations: {},
        visible: true,
      } as unknown as TransformFunction
    }

    const res = formatSummarizedTransforms(record)
    expect(res.transformCount).toBe(10)
    expect(res.truncated).toBe(true)
    expect(res.transforms.length).toBe(8)
  })

  it('formats summarized render settings including 3D camera', () => {
    const rs = formatSummarizedRenderSettings({
      dimensions: 3,
      camera3D: {
        theta: 1,
        phi: 2,
        radius: 5,
        target: [0, 0, 0],
        fov: 60,
        roll: 0,
      },
      exposure: 0.4,
    })

    expect(rs.dimensions).toBe(3)
    expect(rs.camera3D).toBeDefined()
    expect(rs.camera3D?.radius).toBe(5)
    expect(rs.exposure).toBe(0.4)
  })

  it('formats metadata with defaults', () => {
    expect(formatSummarizedMetadata(undefined)).toEqual({
      name: '',
      author: 'unknown',
      description: '',
    })
    expect(
      formatSummarizedMetadata({
        name: 'My Flame',
        author: 'Artist',
        description: 'Test',
      }),
    ).toEqual({
      name: 'My Flame',
      author: 'Artist',
      description: 'Test',
    })
  })
})

describe('getFlameDetail modular subroutines', () => {
  const transforms = {
    t_alpha: {
      probability: 0.5,
      variations: { v1: { type: 'juliaVar', weight: 1 } },
    } as unknown as TransformFunction,
    t_beta: {
      probability: 0.8,
      variations: { v1: { type: 'sphericalVar', weight: 1 } },
    } as unknown as TransformFunction,
  }

  it('resolves transform detail by string id', () => {
    const res = resolveTransformDetail(transforms, 't_alpha')
    expect('transform' in res).toBe(true)
    if ('transform' in res && res.transform) {
      expect(res.transformId).toBe('t_alpha')
      expect(res.transform.probability).toBe(0.5)
    }
  })

  it('resolves transform detail by numeric index', () => {
    const res = resolveTransformDetail(transforms, 1)
    expect('transform' in res).toBe(true)
    if ('transform' in res && res.transform) {
      expect(res.transformId).toBe('t_beta')
      expect(res.index).toBe(1)
    }
  })

  it('returns error when transform target is invalid or missing', () => {
    expect(resolveTransformDetail(transforms, undefined)).toHaveProperty(
      'error',
    )
    expect(resolveTransformDetail(transforms, 'non_existent')).toHaveProperty(
      'error',
    )
  })
})

describe('openArena tool execution contract', () => {
  afterEach(() => {
    clearWebMcpContext()
  })

  it('returns error when workspace context or arena is not available', () => {
    const res = openArena.execute({}, {}) as { error: string }
    expect(res.error).toBeDefined()
  })

  it('refuses a fighter flame that is not a flame, and opens nothing', () => {
    const ctx = createMockCommandContext()
    const setOpen = vi.fn()
    const setPlayer1Stats = vi.fn()
    ctx.arena = {
      setOpen,
      setPlayer1Stats,
      setPlayer2Stats: vi.fn(),
    } as unknown as NonNullable<typeof ctx.arena>
    setWebMcpContext(ctx)

    const res = openArena.execute(
      {
        player1Stats: {},
        player2Stats: {},
        player1Flame: { transforms: { t1: { probability: 'lots' } } },
      },
      {},
    ) as { error?: string }

    expect(res.error).toMatch(/player1Flame/)
    expect(setOpen).not.toHaveBeenCalled()
    expect(setPlayer1Stats).not.toHaveBeenCalled()
  })
})

describe('mutateFlame and randomizeFlame tool execution contract', () => {
  it('returns error when workspace context is not ready for mutateFlame', () => {
    const res = mutateFlame.execute({}, {}) as { error: string }
    expect(res.error).toContain('Workspace not ready')
  })

  it('returns error when workspace context is not ready for randomizeFlame', () => {
    const res = randomizeFlame.execute({}, {}) as { error: string }
    expect(res.error).toContain('Workspace not ready')
  })
})

describe('scoreClashRound tool execution contract', () => {
  it('handles missing clashFlame gracefully', () => {
    const res = scoreClashRound.execute({}, {}) as { error: string }
    expect(res.error).toBe('Invalid or missing clashFlame descriptor.')
  })

  it('scores territory round for a valid clash flame', () => {
    const clashFlame = {
      version: '1',
      transforms: {
        p1_t1_0: {
          probability: 1,
          visible: true,
          color: { x: 0.2, y: 1 },
          colorSpeed: 0.5,
          preAffine: { a: 1, b: 0, c: 0, d: -1, e: 1, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          variations: { v1: { type: 'sphericalVar', weight: 1 } },
        },
        p2_t1_0: {
          probability: 1,
          visible: true,
          color: { x: 0.8, y: 1 },
          colorSpeed: 0.5,
          preAffine: { a: 1, b: 0, c: 0, d: 1, e: 1, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          variations: { v1: { type: 'polarVar', weight: 1 } },
        },
      },
    }

    const res = scoreClashRound.execute({ clashFlame, seed: 100 }, {}) as {
      ownershipA: number
      ownershipB: number
      contested: number
      verdict: 'A' | 'B' | 'draw'
    }

    expect(res.ownershipA).toBeGreaterThanOrEqual(0)
    expect(res.ownershipB).toBeGreaterThanOrEqual(0)
    expect(res.contested).toBeGreaterThanOrEqual(0)
    expect(['A', 'B', 'draw']).toContain(res.verdict)
    expect(res.ownershipA + res.ownershipB + res.contested).toBeCloseTo(1, 2)
  })
})

describe('scoreClashRound verdict margin', () => {
  it('calls a draw when both fighters own exactly the same share', () => {
    // Equal total probability gives each side (1 - contested) / 2, so the
    // ownerships are identical and only a draw is correct. An audit mutation
    // turned the A-wins margin into a handicap and nothing noticed.
    const side = (x: number) => ({
      probability: 1,
      visible: true,
      color: { x, y: 1 },
      colorSpeed: 0.5,
      preAffine: { a: 0.5, b: 0, c: 0, d: 0, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: { v: { type: 'linearVar', weight: 1 } },
    })
    const clashFlame = {
      version: '1',
      transforms: { p1_t1_0: side(0.2), p2_t1_0: side(0.8) },
    }
    const res = scoreClashRound.execute({ clashFlame, seed: 7 }, {}) as {
      ownershipA: number
      ownershipB: number
      verdict: string
    }
    expect(res.ownershipA).toBe(res.ownershipB)
    expect(res.verdict).toBe('draw')
  })
})
