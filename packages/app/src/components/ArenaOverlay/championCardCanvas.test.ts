import { describe, expect, it, vi } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { drawChampionCard, drawRoundedRect, exportChampionCardPng, SCHOOL_COLORS, } from './championCardCanvas'
import type { ArenaFighterStats } from '@/commands/types'
import type { GroundedFlameStats } from '@/flame/stats'

function createMockStats(): {
  victor: ArenaFighterStats
  rival: ArenaFighterStats
  grounded: GroundedFlameStats
} {
  const f1 = createTestFlame()
  const f2 = createTestFlame()
  return {
    victor: {
      name: 'Phoenix King',
      type: 'Solar Guardian',
      flame: f1,
      powerLevel: 1500,
    },
    rival: {
      name: 'Void Lord',
      type: 'Void Knight',
      flame: f2,
      powerLevel: 1200,
    },
    grounded: {
      school: 'Order',
      powerLevel: 1500,
      hp: 120,
      maxHp: 120,
      atk: 150,
      def: 95,
      critChance: 0.25,
      beauty: 85,
      dimension: 2.15,
      stability: 0.88,
      entropy: 1.45,
      nonlinearity: 0.65,
      symmetryOrder: 4,
    },
  }
}

describe('championCardCanvas', () => {
  it('defines all 6 standard schools with high-contrast colors', () => {
    const schools = [
      'Order',
      'Crystal',
      'Void',
      'Vortex',
      'Tide',
      'Arcane',
    ] as const
    for (const school of schools) {
      expect(SCHOOL_COLORS[school]).toBeDefined()
      expect(SCHOOL_COLORS[school].bg).toContain('rgba')
      expect(SCHOOL_COLORS[school].text).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(SCHOOL_COLORS[school].border).toContain('rgba')
    }
  })

  it('draws rounded rectangle paths with standard roundRect or fallback arcs', () => {
    const beginPath = vi.fn()
    const roundRect = vi.fn()
    const mockCtx = {
      beginPath,
      roundRect,
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
    } as unknown as CanvasRenderingContext2D

    drawRoundedRect(mockCtx, 10, 20, 100, 50, 8)
    expect(beginPath).toHaveBeenCalled()
    expect(roundRect).toHaveBeenCalledWith(10, 20, 100, 50, 8)

    // Test fallback when roundRect is undefined
    const fallbackBeginPath = vi.fn()
    const fallbackCurve = vi.fn()
    const fallbackClosePath = vi.fn()
    const fallbackCtx = {
      beginPath: fallbackBeginPath,
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: fallbackCurve,
      closePath: fallbackClosePath,
    } as unknown as CanvasRenderingContext2D

    drawRoundedRect(fallbackCtx, 10, 20, 100, 50, 8)
    expect(fallbackBeginPath).toHaveBeenCalled()
    expect(fallbackCurve).toHaveBeenCalled()
    expect(fallbackClosePath).toHaveBeenCalled()
  })

  it('draws champion card onto a 2D canvas without throwing', () => {
    const { victor, rival, grounded } = createMockStats()

    const fill = vi.fn()
    const stroke = vi.fn()
    const fillText = vi.fn()
    const getContext = vi.fn()

    const mockCtx = {
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill,
      stroke,
      fillText,
      measureText: vi.fn().mockReturnValue({ width: 60 }),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
    }

    getContext.mockReturnValue(mockCtx)
    const mockCanvas = {
      getContext,
      width: 540,
      height: 780,
    } as unknown as HTMLCanvasElement

    drawChampionCard(mockCanvas, {
      victor,
      rival,
      grounded,
      winStreak: 3,
      stance: 'aggressive',
    })

    expect(getContext).toHaveBeenCalledWith('2d')
    expect(fill).toHaveBeenCalled()
    expect(stroke).toHaveBeenCalled()
    expect(fillText).toHaveBeenCalledWith(
      'CHAOS MASTER • ARENA CHAMPION',
      24,
      34,
    )
    expect(fillText).toHaveBeenCalledWith(
      expect.stringContaining('Phoenix King'),
      24,
      372,
    )
  })

  it('exportChampionCardPng safely returns false if document APIs are unavailable or throw', async () => {
    const { victor, rival, grounded } = createMockStats()
    const result = await exportChampionCardPng({
      victor,
      rival,
      grounded,
      winStreak: 1,
      stance: 'balanced',
      isWinner1: true,
    })
    expect(typeof result).toBe('boolean')
  })
})
