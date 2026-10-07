import { describe, expect, it } from 'vitest'
import { simulateClash } from './simulateClash'
import type { SimulateClashResult } from './simulateClash'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

describe('simulateClash tool', () => {
  const flameA: FlameDescriptor = {
    version: '1',
    metadata: { name: 'Champion A' },
    renderSettings: { exposure: 0.5, vibrancy: 0.5, dimensions: 3 },
    transforms: {
      t1: {
        weight: 1,
        color: 0.2,
        colorSpeed: 0.6,
        affine: {
          a: 1,
          b: 0,
          c: 0,
          d: 0,
          e: 1,
          f: 0,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 1,
          l: 0,
        },
        variations: { spherical: { weight: 1 } },
        visible: true,
      },
      t2: {
        weight: 1,
        color: 0.4,
        colorSpeed: 0.8,
        affine: {
          a: 0.8,
          b: 0,
          c: 0,
          d: 0,
          e: 0.8,
          f: 0,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 0.8,
          l: 0,
        },
        variations: { swirl: { weight: 1 } },
        visible: true,
      },
    },
  } as unknown as FlameDescriptor

  const flameB: FlameDescriptor = {
    version: '1',
    metadata: { name: 'Nemesis B' },
    renderSettings: { exposure: 0.6, vibrancy: 0.6, dimensions: 3 },
    transforms: {
      t1: {
        weight: 1,
        color: 0.8,
        colorSpeed: 0.4,
        affine: {
          a: 1,
          b: 0,
          c: 0,
          d: 0,
          e: 1,
          f: 0,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 1,
          l: 0,
        },
        variations: { polar: { weight: 1 } },
        visible: true,
      },
    },
  } as unknown as FlameDescriptor

  it('runs multi-round simulation and produces round outcomes', () => {
    const result = simulateClash.execute(
      {
        flameA,
        flameB,
        rounds: 3,
        seed: 12345,
      },
      {},
    ) as SimulateClashResult

    expect(result.rounds).toBeDefined()
    expect(result.rounds.length).toBe(3)
    expect(['A', 'B', 'draw']).toContain(result.winner)
    expect(result.finalScore.A + result.finalScore.B).toBeLessThanOrEqual(3)

    for (const r of result.rounds) {
      expect(r.round).toBeGreaterThanOrEqual(1)
      expect(r.ownershipA + r.ownershipB + r.contested).toBeCloseTo(1, 1)
      expect(r.clashFlame).toBeDefined()
    }
  })

  it('supports tactical stances in simulation input', () => {
    const resResonance = simulateClash.execute(
      {
        flameA,
        flameB,
        rounds: 3,
        seed: 54321,
        stanceA: 'resonance',
        stanceB: 'bastion',
      },
      {},
    ) as SimulateClashResult

    expect(resResonance.rounds.length).toBe(3)
    expect(resResonance.winner).toBeDefined()
  })

  it('handles missing input gracefully', () => {
    const res = simulateClash.execute({}, {}) as { error: string }
    expect(res.error).toBeDefined()
  })

  it('determines overall winner correctly', async () => {
    const { determineOverallWinner } = await import('./simulateClash')
    expect(determineOverallWinner(2, 1)).toBe('A')
    expect(determineOverallWinner(1, 2)).toBe('B')
    expect(determineOverallWinner(1, 1)).toBe('draw')
  })

  it('detects narrative events across diverse clash scenarios', async () => {
    const { detectNarrativeEvent, calculateStanceAdjustedStats } =
      await import('./simulateClash')
    const statsA = calculateStanceAdjustedStats(flameA, 'balanced')
    const statsB = calculateStanceAdjustedStats(flameB, 'balanced')

    // Contested > 0.35 -> Entangled
    const entangled = detectNarrativeEvent(
      'draw',
      {
        verdict: 'draw',
        ownershipA: 0.3,
        ownershipB: 0.3,
        contested: 0.4,
        totalDensity: 100,
      },
      statsA,
      statsB,
      1,
    )
    expect(entangled).toBe('Entangled')

    // Low ownership -> Collapse
    const collapse = detectNarrativeEvent(
      'A',
      {
        verdict: 'A',
        ownershipA: 0.86,
        ownershipB: 0.14,
        contested: 0.0,
        totalDensity: 100,
      },
      statsA,
      statsB,
      1,
    )
    expect(collapse).toBe('Collapse')
  })

  it('rebalances probabilities after a round win', async () => {
    const { applyRoundProbabilityRebalance, calculateStanceAdjustedStats } =
      await import('./simulateClash')
    const statsA = calculateStanceAdjustedStats(flameA, 'balanced')
    const statsB = calculateStanceAdjustedStats(flameB, 'balanced')

    const staged = {
      version: '1',
      transforms: {
        p1_0_0: { probability: 1 },
        p2_0_0: { probability: 1 },
      },
    } as unknown as FlameDescriptor

    applyRoundProbabilityRebalance(staged, 'A', statsA, statsB)
    const stagedTransforms = staged.transforms as Record<
      string,
      { probability: number }
    >
    expect(stagedTransforms.p1_0_0?.probability).toBeGreaterThan(1.0)
    expect(stagedTransforms.p2_0_0?.probability).toBeLessThan(1.0)
  })
})
