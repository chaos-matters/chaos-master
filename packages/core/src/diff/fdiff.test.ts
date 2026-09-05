import { describe, expect, it } from 'vitest'
import { renderSettingsDefault, validateFlame } from '../schema/flameSchema'
import { diffFlames } from './fdiff'

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
