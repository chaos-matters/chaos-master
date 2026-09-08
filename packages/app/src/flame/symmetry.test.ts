import { describe, expect, it } from 'vitest'
import { calculateGroundedStats } from '@/flame/stats'
import { applySymmetryToFlame } from './symmetry'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

const baseFlame = {
  version: '1.0',
  metadata: { author: 'test', name: 'Base Flame', description: '' },
  renderSettings: { dimensions: 2 },
  transforms: {
    t1: {
      probability: 1,
      color: 0.2,
      colorSpeed: 0,
      visible: true,
      preAffine: { a: 0.5, b: 0, c: 0, d: 0, e: 0.5, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: { v1: { type: 'linear', weight: 1, visible: true } },
    },
  },
} as unknown as FlameDescriptor

describe('applySymmetryToFlame', () => {
  it('adds n-1 transforms for n-fold rotational symmetry', () => {
    const sym3 = applySymmetryToFlame(baseFlame, 3, 'rotational')
    const symKeys = Object.keys(sym3.transforms).filter((k) =>
      k.startsWith('_sym__'),
    )
    expect(symKeys).toHaveLength(2)

    const stats = calculateGroundedStats(sym3)
    expect(stats.symmetryOrder).toBe(3)
  })

  it('removes existing symmetry transforms when applying 1-fold or higher', () => {
    const sym4 = applySymmetryToFlame(baseFlame, 4, 'rotational')
    expect(
      Object.keys(sym4.transforms).filter((k) => k.startsWith('_sym__')),
    ).toHaveLength(3)

    const sym1 = applySymmetryToFlame(sym4, 1)
    expect(
      Object.keys(sym1.transforms).filter((k) => k.startsWith('_sym__')),
    ).toHaveLength(0)
  })

  it('supports dihedral symmetry with reflection', () => {
    const dih4 = applySymmetryToFlame(baseFlame, 4, 'dihedral')
    const symKeys = Object.keys(dih4.transforms).filter((k) =>
      k.startsWith('_sym__'),
    )
    // 3 rotations + 1 reflection
    expect(symKeys).toHaveLength(4)
  })
})
