import { describe, expect, it } from 'vitest'
import { renderSettingsDefault, validateFlame } from '../schema/flameSchema'
import { diffFlames, diffTransforms } from './fdiff'

describe('core flame diffing', () => {
  const baseFlame = validateFlame({
    renderSettings: { ...renderSettingsDefault },
    transforms: {
      t1: {
        probability: 1,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0, y: 0 },
        variations: {
          v1: { type: 'linearVar', weight: 1 },
        },
      },
    },
  })

  it('yields 100% similarity for identical flames', () => {
    const diff = diffFlames(baseFlame, baseFlame)
    expect(diff.overallSimilarity).toBe(100)
    expect(diff.matchedTransforms).toHaveLength(1)
    expect(diff.unmatchedA).toHaveLength(0)
    expect(diff.unmatchedB).toHaveLength(0)
  })

  it('detects variations and render settings changes', () => {
    const modifiedFlame = validateFlame({
      ...baseFlame,
      renderSettings: {
        ...baseFlame.renderSettings,
        exposure: 4,
      },
      transforms: {
        t2: {
          probability: 1,
          preAffine: { a: 2, b: 0, c: 0, d: 0, e: 2, f: 0 },
          postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          color: { x: 0.5, y: 0.5 },
          variations: {
            v1: { type: 'sphericalVar', weight: 1 },
          },
        },
      },
    })

    const diff = diffFlames(baseFlame, modifiedFlame)
    expect(diff.overallSimilarity).toBeLessThan(100)
    expect(diff.renderDiffs.some((d) => d.setting === 'exposure')).toBe(true)
  })
})

/**
 * Who became what, when the similarity scores cannot say.
 *
 * The pairing decides what a transition animates: a matched transform is
 * morphed, an unmatched one fades. Identical candidates are common — duplicate
 * a transform and delete one, and every score ties — so the tie-break is the
 * whole answer, and it has to give the same answer on every machine. Collation
 * does not: `'a'.localeCompare('B')` is negative under the default locale and
 * the opposite of how the two ids compare as strings, and which of the two it
 * is depends on the runtime's ICU data.
 */
describe('a tied pairing', () => {
  const shape = {
    probability: 1,
    preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: 0, y: 0 },
    variations: { v1: { type: 'linearVar', weight: 1 } },
  }
  const flameOf = (ids: string[]) =>
    validateFlame({
      renderSettings: { ...renderSettingsDefault },
      transforms: Object.fromEntries(ids.map((id) => [id, { ...shape }])),
    })

  // Ids chosen so the two orders disagree: as strings 'B2' sorts before 'a1',
  // under collation it does not.
  it('is broken by the id in A, as a string and not as a word', () => {
    const { matched, unmatchedA } = diffTransforms(
      flameOf(['B2', 'a1']),
      flameOf(['keep']),
    )

    expect(matched.map((m) => m.idA)).toEqual(['B2'])
    expect(unmatchedA).toEqual(['a1'])
  })

  it('is broken by the id in B the same way', () => {
    const { matched, unmatchedB } = diffTransforms(
      flameOf(['one']),
      flameOf(['B2', 'a1']),
    )

    expect(matched.map((m) => m.idB)).toEqual(['B2'])
    expect(unmatchedB).toEqual(['a1'])
  })
})
