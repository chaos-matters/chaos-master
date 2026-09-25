import { describe, expect, it, vi } from 'vitest'
import { calculateGroundedStats } from '@/flame/stats'
import { applySymmetryToFlame } from './symmetry'
import { createFlameWgsl } from './transformFunction'
import { isVariationTypeFor } from './variationRegistry'
import type { Dims } from './variationRegistry'
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
      variations: { v1: { type: 'linearVar', weight: 1, visible: true } },
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

// Flame Clash's C1-C8 buttons call applySymmetryToFlame. It wrote the 2D
// variation type as 'linear', a name the 2D registry does not have (it is
// 'linearVar'), so createFlameWgsl skipped the variation with a warning and
// every symmetry transform added to a 2D fighter mapped each point to zero.
describe('applySymmetryToFlame writes registered variation types', () => {
  const flame2D = {
    version: '1.0',
    metadata: { author: 'test', name: 'Fighter 2D', description: '' },
    renderSettings: { dimensions: 2 },
    transforms: {
      t1: {
        probability: 1,
        color: { x: 0.2, y: 0 },
        colorSpeed: 0.4,
        visible: true,
        preAffine: { a: 0.5, b: 0, c: 0.1, d: 0, e: 0.5, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        variations: { v1: { type: 'sphericalVar', weight: 1, visible: true } },
      },
    },
  } as unknown as FlameDescriptor

  const flame3D = {
    version: '1.0',
    metadata: { author: 'test', name: 'Fighter 3D', description: '' },
    renderSettings: { dimensions: 3 },
    transforms: {
      t1: {
        probability: 1,
        color: { x: 0.2, y: 0 },
        colorSpeed: 0.4,
        visible: true,
        preAffine: {
          a: 0.5,
          b: 0,
          c: 0,
          d: 0.1,
          e: 0,
          f: 0.5,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 0.5,
          l: 0,
        },
        postAffine: {
          a: 1,
          b: 0,
          c: 0,
          d: 0,
          e: 0,
          f: 1,
          g: 0,
          h: 0,
          i: 0,
          j: 0,
          k: 1,
          l: 0,
        },
        variations: { v1: { type: 'linear3D', weight: 1, visible: true } },
      },
    },
  } as unknown as FlameDescriptor

  const unregisteredTypes = (flame: FlameDescriptor, dims: Dims) =>
    Object.entries(flame.transforms).flatMap(([tid, transform]) =>
      Object.values(transform.variations)
        .filter((variation) => !isVariationTypeFor(dims, variation.type))
        .map((variation) => `${tid}: ${variation.type}`),
    )

  const cases = [
    { dims: 2 as const, flame: flame2D, linear: 'linearVar' },
    { dims: 3 as const, flame: flame3D, linear: 'linear3D' },
  ]

  for (const { dims, flame, linear } of cases) {
    it(`${dims}D: every symmetry transform carries ${linear}`, () => {
      const result = applySymmetryToFlame(flame, 4, 'dihedral')
      const symTypes = Object.entries(result.transforms)
        .filter(([tid]) => tid.startsWith('_sym__'))
        .flatMap(([, t]) => Object.values(t.variations).map((v) => v.type))
      expect(symTypes).toEqual([linear, linear, linear, linear])
    })

    for (const type of ['rotational', 'dihedral'] as const) {
      it(`${dims}D ${type}: every variation is in the ${dims}D registry`, () => {
        for (let folds = 2; folds <= 8; folds++) {
          const result = applySymmetryToFlame(flame, folds, type)
          expect(unregisteredTypes(result, dims)).toEqual([])
        }
      })
    }
  }

  it('2D: the shader builder keeps every symmetry variation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = applySymmetryToFlame(flame2D, 4, 'dihedral')
      for (const transform of Object.values(result.transforms)) {
        createFlameWgsl({ variations: transform.variations })
      }
      expect(warn).not.toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
