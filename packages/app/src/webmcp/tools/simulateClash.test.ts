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
})
