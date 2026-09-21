import { describe, expect, it } from 'vitest'
import { pairTransforms, pairVariations } from './pairing'
import { makeFlame } from './testUtils'
import type { TransformFunction } from '@/flame/schema/flameSchema'

function variations(
  spec: Record<string, { type: string; weight?: number }>,
): TransformFunction['variations'] {
  const flame = makeFlame({
    transforms: {
      one: {
        variations: Object.fromEntries(
          Object.entries(spec).map(([id, entry]) => [
            id,
            { type: entry.type, weight: entry.weight ?? 1 },
          ]),
        ),
      },
    },
  })
  return (flame.transforms as unknown as Record<string, TransformFunction>).one!
    .variations
}

describe('pairTransforms', () => {
  it('pairs the same id first, which is the single-command case', () => {
    const a = makeFlame({
      transforms: { x: { preAffine: { c: 1 } }, y: { preAffine: { c: 2 } } },
    })
    const b = makeFlame({
      transforms: { x: { preAffine: { c: 9 } }, y: { preAffine: { c: 8 } } },
    })
    const pairing = pairTransforms(a, b)
    expect(pairing.matched).toEqual([
      { idA: 'x', idB: 'x' },
      { idA: 'y', idB: 'y' },
    ])
    expect(pairing.onlyA).toEqual([])
    expect(pairing.onlyB).toEqual([])
  })

  it('pairs the residue by similarity, not by order', () => {
    const a = makeFlame({
      transforms: {
        alpha: {
          preAffine: { c: 0.5 },
          variations: { v: { type: 'swirlVar' } },
        },
        beta: {
          preAffine: { c: -0.5 },
          variations: { v: { type: 'linearVar' } },
        },
      },
    })
    const b = makeFlame({
      transforms: {
        first: {
          preAffine: { c: -0.5 },
          variations: { v: { type: 'linearVar' } },
        },
        second: {
          preAffine: { c: 0.5 },
          variations: { v: { type: 'swirlVar' } },
        },
      },
    })
    const pairing = pairTransforms(a, b)
    expect(pairing.matched).toContainEqual({ idA: 'alpha', idB: 'second' })
    expect(pairing.matched).toContainEqual({ idA: 'beta', idB: 'first' })
  })

  it('refuses a pairing that shares nothing, so the cast really changes', () => {
    const a = makeFlame({
      transforms: {
        one: { variations: { v: { type: 'linearVar' } } },
      },
    })
    const b = makeFlame({
      transforms: {
        two: {
          preAffine: { a: -6, c: 30 },
          postAffine: { a: 4, b: -7, c: 20, d: 8, e: -3, f: 12 },
          color: { x: 0, y: 1 },
          variations: { v: { type: 'bubbleVar' } },
        },
      },
    })
    const pairing = pairTransforms(a, b)
    expect(pairing.matched).toEqual([])
    expect(pairing.onlyA).toEqual(['one'])
    expect(pairing.onlyB).toEqual(['two'])
  })

  it('reports everything as added when A is empty', () => {
    const a = makeFlame({ transforms: {} })
    const b = makeFlame({ transforms: { one: {}, two: {} } })
    const pairing = pairTransforms(a, b)
    expect(pairing.matched).toEqual([])
    expect(pairing.onlyB).toEqual(['one', 'two'])
  })

  it('is deterministic for equally similar candidates', () => {
    const a = makeFlame({ transforms: { p: {}, q: {} } })
    const b = makeFlame({ transforms: { r: {}, s: {} } })
    const first = pairTransforms(a, b)
    for (let index = 0; index < 5; index++) {
      expect(pairTransforms(a, b)).toEqual(first)
    }
  })
})

describe('pairVariations', () => {
  it('pairs by id when the type is unchanged', () => {
    const pairing = pairVariations(
      variations({ v: { type: 'linearVar', weight: 1 } }),
      variations({ v: { type: 'linearVar', weight: 0.2 } }),
    )
    expect(pairing.matched).toEqual([{ idA: 'v', idB: 'v' }])
    expect(pairing.retyped).toEqual([])
  })

  it('treats a changed type on the same id as a removal plus an addition', () => {
    const pairing = pairVariations(
      variations({ v: { type: 'linearVar' } }),
      variations({ v: { type: 'swirlVar' } }),
    )
    expect(pairing.matched).toEqual([])
    expect(pairing.retyped).toEqual([{ idA: 'v', idB: 'v' }])
  })

  it('pairs a re-added variation by type when the id changed', () => {
    const pairing = pairVariations(
      variations({ old: { type: 'swirlVar', weight: 1 } }),
      variations({ fresh: { type: 'swirlVar', weight: 0.5 } }),
    )
    expect(pairing.matched).toEqual([{ idA: 'old', idB: 'fresh' }])
    expect(pairing.onlyA).toEqual([])
    expect(pairing.onlyB).toEqual([])
  })

  it('reports genuine additions and removals', () => {
    const pairing = pairVariations(
      variations({ keep: { type: 'linearVar' }, drop: { type: 'crossVar' } }),
      variations({ keep: { type: 'linearVar' }, add: { type: 'bubbleVar' } }),
    )
    expect(pairing.matched).toEqual([{ idA: 'keep', idB: 'keep' }])
    expect(pairing.onlyA).toEqual(['drop'])
    expect(pairing.onlyB).toEqual(['add'])
  })
})
