import { describe, expect, it } from 'vitest'
import { extractFlameUniforms } from '../transformFunction'
import { extractFlameUniforms3D } from '../transformFunction3D'
import { isParametricVariationType3D, variationTypes3D } from '../variations3D'
import { isAnyParametricVariationType } from '.'
import { getDefaultFlameByVarType, getDefaultFlameByVarType3D, getVariationDefault, getVariationPreviewFlame3D, } from './utils'

// These guard the #97/#98 regression where preview flames were built with a
// raw `as unknown as FlameDescriptor` cast that skipped schema defaults —
// dropping `visible` (→ probability 0 → no shape) and `vibrancy`
// (→ chroma × 0 → grayscale). Routing the builders through defineExample(3D)
// fills those defaults again.

describe('2D variation preview flames', () => {
  const flame = getDefaultFlameByVarType('sphericalVar')
  const transform = Object.values(flame.transforms)[0]!

  it('fills the vibrancy default so previews render in color', () => {
    expect(flame.renderSettings.vibrancy).toBe(0.5)
  })

  it('fills the transform visible default so the variation is applied', () => {
    expect(transform.visible).toBe(true)
    const uniforms = extractFlameUniforms(flame)
    const entry = Object.values(uniforms)[0] as { probability: number }
    expect(entry.probability).toBe(1)
  })
})

describe('3D variation preview flames', () => {
  const type3d = variationTypes3D[0] as never
  const flame = getDefaultFlameByVarType3D(type3d)
  const transform = Object.values(flame.transforms)[0]!

  it('declares 3D and fills the vibrancy default', () => {
    expect(flame.renderSettings.dimensions).toBe(3)
    expect(flame.renderSettings.vibrancy).toBe(0.5)
  })

  it('preserves the 12-parameter 3D affine through validation', () => {
    expect('g' in transform.preAffine).toBe(true)
    expect('l' in transform.preAffine).toBe(true)
  })

  it('fills the transform visible default so the variation is applied', () => {
    expect(transform.visible).toBe(true)
    const uniforms = extractFlameUniforms3D(flame)
    const entry = Object.values(uniforms)[0] as { probability: number }
    expect(entry.probability).toBe(1)
  })

  it('builds a schema-valid, applied preview flame for every 3D variation', () => {
    for (const type of variationTypes3D) {
      const f = getDefaultFlameByVarType3D(type)
      const tr = Object.values(f.transforms)[0]!
      expect(tr.visible, type).toBe(true)
      const entry = Object.values(extractFlameUniforms3D(f))[0] as {
        probability: number
      }
      expect(entry.probability, type).toBe(1)
    }
  })
})

describe('3D parametric variations expose params to the editor UI', () => {
  it('marks 3D parametric variations as parametric and fills param defaults', () => {
    for (const type of variationTypes3D) {
      if (!isParametricVariationType3D(type)) continue
      // The variation-selector / sidebar gate the params editor on this.
      expect(isAnyParametricVariationType(type), type).toBe(true)
      const variation = getVariationDefault(type, 1)
      expect(
        (variation as { params?: Record<string, number> }).params,
        type,
      ).toBeDefined()
    }
  })
})

describe('curated 3D preview overrides', () => {
  it('applies the tuned pdj3D override instead of the generic default', () => {
    const flame = getVariationPreviewFlame3D('pdj3D')
    // Tuned values from the override (distinct from the generic defaults).
    expect(flame.renderSettings.exposure).toBe(0.832)
    expect(flame.renderSettings.camera3D?.radius).toBeCloseTo(3.0783846)
    const variation = Object.values(
      Object.values(flame.transforms)[0]!.variations,
    )[0] as { type: string; params: Record<string, number> }
    expect(variation.type).toBe('pdj3D')
    expect(variation.params.a).toBe(-0.42)
  })

  it('applies the tuned rectangles3D override', () => {
    const flame = getVariationPreviewFlame3D('rectangles3D')
    expect(flame.renderSettings.exposure).toBe(1.892)
    expect(flame.renderSettings.camera3D?.radius).toBeCloseTo(9.726998)
  })
})
