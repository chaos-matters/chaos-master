import { describe, expect, it } from 'vitest'
import { deepClone } from '@/utils/clone'
import { example1 } from './examples/example1'
import { example3 } from './examples/example3'
import { diffFlames } from './fdiff'
import { validateFlame } from './schema/flameSchema'
import type { FlameDescriptor } from './schema/flameSchema'

interface TransformSpec {
  variationType: string
  /** preAffine translation coefficient — differentiates transform content. */
  c?: number
  color?: { x: number; y: number }
}

/** Build a valid flame whose transforms keep the given record keys as ids. */
function makeFlame(specs: Record<string, TransformSpec>): FlameDescriptor {
  const count = Object.keys(specs).length
  const transforms: Record<string, unknown> = {}
  for (const [id, spec] of Object.entries(specs)) {
    transforms[id] = {
      probability: 1 / count,
      preAffine: { a: 1, b: 0, c: spec.c ?? 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: spec.color ?? { x: 0.5, y: 0.5 },
      variations: { [`v_${id}`]: { type: spec.variationType, weight: 1 } },
    }
  }
  return validateFlame({ version: '1.0', transforms })
}

describe('diffFlames', () => {
  it('scores identical flames at 100', () => {
    const result = diffFlames(example1, deepClone(example1))
    expect(result.overallSimilarity).toBe(100)
    expect(result.renderSimilarity).toBeCloseTo(1, 12)
    expect(result.unmatchedA).toEqual([])
    expect(result.unmatchedB).toEqual([])
    expect(result.matchedTransforms).toHaveLength(
      Object.keys(example1.transforms).length,
    )
    for (const match of result.matchedTransforms) {
      expect(match.similarity).toBeCloseTo(1, 12)
    }
    expect(result.weights).toEqual({ transforms: 0.55, render: 0.45 })
  })

  it('scores two flames with no transforms at 100', () => {
    const a = validateFlame({ version: '1.0', transforms: {} })
    const b = validateFlame({ version: '1.0', transforms: {} })
    const result = diffFlames(a, b)
    expect(result.overallSimilarity).toBe(100)
    expect(result.matchedTransforms).toEqual([])
    expect(result.unmatchedA).toEqual([])
    expect(result.unmatchedB).toEqual([])
  })

  it('matches transforms by content, not id or order', () => {
    const a = makeFlame({
      alpha: { variationType: 'swirlVar', c: 0.5, color: { x: 0.9, y: 0.1 } },
      beta: { variationType: 'linearVar', c: -0.5, color: { x: 0.1, y: 0.9 } },
    })
    const b = makeFlame({
      first: { variationType: 'linearVar', c: -0.5, color: { x: 0.1, y: 0.9 } },
      second: { variationType: 'swirlVar', c: 0.5, color: { x: 0.9, y: 0.1 } },
    })
    const result = diffFlames(a, b)
    expect(result.overallSimilarity).toBe(100)
    expect(result.unmatchedA).toEqual([])
    expect(result.unmatchedB).toEqual([])
    const pairs = new Map(result.matchedTransforms.map((m) => [m.idA, m.idB]))
    expect(pairs.get('alpha')).toBe('second')
    expect(pairs.get('beta')).toBe('first')
  })

  it('reports and penalizes unmatched transforms', () => {
    const a = makeFlame({
      shared: { variationType: 'linearVar' },
      extra: { variationType: 'swirlVar', c: 1, color: { x: 0.9, y: 0.9 } },
    })
    const b = makeFlame({
      mirror: { variationType: 'linearVar' },
    })
    const result = diffFlames(a, b)
    expect(result.matchedTransforms).toHaveLength(1)
    expect(result.matchedTransforms[0]!.idA).toBe('shared')
    expect(result.matchedTransforms[0]!.idB).toBe('mirror')
    expect(result.unmatchedA).toEqual(['extra'])
    expect(result.unmatchedB).toEqual([])
    expect(result.overallSimilarity).toBeLessThan(100)
  })

  it('compares render settings per setting', () => {
    const a = makeFlame({ only: { variationType: 'linearVar' } })
    const b = deepClone(a)
    a.renderSettings.exposure = -4
    b.renderSettings.exposure = 4
    const result = diffFlames(a, b)
    const exposure = result.renderDiffs.find((d) => d.setting === 'exposure')
    expect(exposure).toBeDefined()
    expect(exposure!.label).toBe('Exposure')
    expect(exposure!.valueA).toBe(-4)
    expect(exposure!.valueB).toBe(4)
    // |-4 - 4| = 8 over the 16-stop exposure range
    expect(exposure!.similarity).toBeCloseTo(0.5, 12)
    const gamma = result.renderDiffs.find((d) => d.setting === 'gamma')
    expect(gamma!.similarity).toBe(1)
    expect(result.renderSimilarity).toBeLessThan(1)
    // Transforms are identical — only render settings differ
    expect(result.matchedTransforms[0]!.similarity).toBeCloseTo(1, 12)
    expect(result.overallSimilarity).toBeLessThan(100)
  })

  it('matches at most min(|A|, |B|) transforms', () => {
    const countA = Object.keys(example1.transforms).length
    const countB = Object.keys(example3.transforms).length
    const result = diffFlames(example1, example3)
    expect(result.matchedTransforms).toHaveLength(Math.min(countA, countB))
    expect(result.unmatchedA).toHaveLength(Math.max(0, countA - countB))
    expect(result.unmatchedB).toHaveLength(Math.max(0, countB - countA))
  })

  it('is symmetric', () => {
    const ab = diffFlames(example1, example3)
    const ba = diffFlames(example3, example1)
    expect(ba.overallSimilarity).toBe(ab.overallSimilarity)
    expect(ba.unmatchedA).toEqual(ab.unmatchedB)
    expect(ba.unmatchedB).toEqual(ab.unmatchedA)
  })
})
