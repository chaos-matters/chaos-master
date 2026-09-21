import { describe, expect, it } from 'vitest'
import { clampGlideMs, classifyChange, easingFor, GLIDE_DURATIONS, glideFrameCount, } from './durations'
import { GLIDE_QUALITY_SCALE, GLIDE_QUALITY_TIERS, glideFrameQuality, glideTierForQualityPreset, isGlideQualityPreference, resolveGlideQuality, } from './quality'
import { MAX_GLIDE_MS, MIN_GLIDE_MS } from './types'

const NO_CHANGE = {
  transformsAdded: 0,
  transformsRemoved: 0,
  variationsAdded: 0,
  variationsRemoved: 0,
  unionTransforms: 4,
  cameraChanged: false,
  anyChange: false,
}

describe('quality tiers', () => {
  it('downshifts on the responsive tier and not at all on full', () => {
    expect(GLIDE_QUALITY_TIERS.responsive.accumulationScale).toBeCloseTo(
      0.35,
      12,
    )
    expect(GLIDE_QUALITY_TIERS.balanced.accumulationScale).toBeCloseTo(0.6, 12)
    expect(GLIDE_QUALITY_TIERS.full.accumulationScale).toBe(1)
    expect(GLIDE_QUALITY_SCALE).toBe(
      GLIDE_QUALITY_TIERS.responsive.accumulationScale,
    )
  })

  it('derives the tier from the workspace quality preset', () => {
    expect(glideTierForQualityPreset('low')).toBe('responsive')
    expect(glideTierForQualityPreset('mid')).toBe('responsive')
    expect(glideTierForQualityPreset('high')).toBe('balanced')
    expect(glideTierForQualityPreset('ultra')).toBe('full')
    expect(glideTierForQualityPreset(undefined)).toBe('responsive')
  })

  it('lets an explicit preference override the preset', () => {
    expect(resolveGlideQuality('full', 'low').tier).toBe('full')
    expect(resolveGlideQuality('auto', 'ultra').tier).toBe('full')
    expect(resolveGlideQuality(undefined, 'high').tier).toBe('balanced')
  })

  it('glides for longer at a higher tier', () => {
    expect(GLIDE_QUALITY_TIERS.full.durationScale).toBeGreaterThan(
      GLIDE_QUALITY_TIERS.balanced.durationScale,
    )
    expect(GLIDE_QUALITY_TIERS.balanced.durationScale).toBeGreaterThan(
      GLIDE_QUALITY_TIERS.responsive.durationScale,
    )
  })

  it('always settles at full quality, in every tier', () => {
    for (const tier of ['responsive', 'balanced', 'full'] as const) {
      const quality = resolveGlideQuality(tier)
      expect(glideFrameQuality(0.9, quality, 1)).toBe(0.9)
      expect(glideFrameQuality(0.9, quality, 0.5)).toBeCloseTo(
        0.9 * GLIDE_QUALITY_TIERS[tier].accumulationScale,
        12,
      )
    }
  })

  it('validates a preference from an untrusted caller', () => {
    expect(isGlideQualityPreference('auto')).toBe(true)
    expect(isGlideQualityPreference('balanced')).toBe(true)
    expect(isGlideQualityPreference('turbo')).toBe(false)
    expect(isGlideQualityPreference(3)).toBe(false)
  })
})

describe('durations', () => {
  it('orders the table so a whole-flame load never reads as a snap', () => {
    expect(GLIDE_DURATIONS.scalar).toBeLessThan(GLIDE_DURATIONS.variation)
    expect(GLIDE_DURATIONS.variation).toBeLessThan(GLIDE_DURATIONS.transform)
    expect(GLIDE_DURATIONS.transform).toBeLessThan(GLIDE_DURATIONS.whole)
  })

  it('classifies by the longest applicable change', () => {
    expect(classifyChange(NO_CHANGE)).toBe('none')
    expect(classifyChange({ ...NO_CHANGE, anyChange: true })).toBe('scalar')
    expect(
      classifyChange({ ...NO_CHANGE, anyChange: true, cameraChanged: true }),
    ).toBe('camera')
    expect(
      classifyChange({
        ...NO_CHANGE,
        anyChange: true,
        cameraChanged: true,
        variationsAdded: 1,
      }),
    ).toBe('variation')
    expect(
      classifyChange({
        ...NO_CHANGE,
        anyChange: true,
        variationsAdded: 1,
        transformsAdded: 1,
      }),
    ).toBe('transform')
    expect(
      classifyChange({
        ...NO_CHANGE,
        anyChange: true,
        unionTransforms: 6,
        transformsAdded: 3,
        transformsRemoved: 3,
      }),
    ).toBe('whole')
  })

  it('uses one curve for the whole glide so the Σp identity survives', () => {
    expect(easingFor('transform')).toBe(easingFor('scalar'))
    expect(easingFor('whole')).toBe('easeInOut')
  })

  it('clamps a requested duration', () => {
    expect(clampGlideMs(0)).toBe(0)
    expect(clampGlideMs(-5)).toBe(0)
    expect(clampGlideMs(10)).toBe(MIN_GLIDE_MS)
    expect(clampGlideMs(99_999)).toBe(MAX_GLIDE_MS)
    expect(clampGlideMs(1200)).toBe(1200)
  })

  it('counts frames at the configured fps with a floor of two', () => {
    expect(glideFrameCount(1000, 24)).toBe(24)
    expect(glideFrameCount(1000, 30)).toBe(30)
    expect(glideFrameCount(0, 24)).toBe(2)
  })
})
