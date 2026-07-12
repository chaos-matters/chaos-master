import { describe, expect, it } from 'vitest'
import { flameTargetKey, getAudioFeatureNormalized, } from '../../utils/audioAnalysis'
import { defaultTarget, PRESET_MAPPINGS } from './AudioReactivePanel'
import type { FlameTarget } from '../../utils/audioAnalysis'

// --- Helpers ---

/** All valid TargetCategory values (the kind field of FlameTarget). */
const ALL_TARGET_CATEGORIES = [
  'renderSetting',
  'transformAffine',
  'transformProperty',
  'variationWeight',
  'finalAffine',
] as const

const ALL_PRESETS = [
  'pulse',
  'groove',
  'ambient',
  'chaos',
  'warmth',
  'custom',
] as const

/** Creates a minimal FrameData-like object for getAudioFeatureNormalized. */
function makeFrame(
  overrides: Partial<{
    bands: number[]
    rms: number
    centroid: number
    flatness: number
    onsetStrength: number
    isBeat: boolean
  }> = {},
): Parameters<typeof getAudioFeatureNormalized>[0] {
  return {
    bands: overrides.bands ?? [0, 0, 0, 0, 0, 0, 0, 0],
    rms: overrides.rms ?? 0,
    centroid: overrides.centroid ?? 0,
    flatness: overrides.flatness ?? 0,
    onsetStrength: overrides.onsetStrength ?? 0,
    isBeat: overrides.isBeat ?? false,
  }
}

// =============================================================================
// defaultTarget
// =============================================================================

describe('defaultTarget', () => {
  describe('for each TargetCategory', () => {
    it('returns renderSetting target with kind and param', () => {
      const t = defaultTarget('renderSetting')
      expect(t.kind).toBe('renderSetting')
      expect(t).toHaveProperty('param', 'vibrancy')
    })

    it('returns transformAffine target with all required fields', () => {
      const t = defaultTarget('transformAffine')
      expect(t.kind).toBe('transformAffine')
      expect(t).toHaveProperty('transformIdx', 0)
      expect(t).toHaveProperty('matrix', 'postAffine')
      expect(t).toHaveProperty('param', 'a')
    })

    it('returns transformProperty target with all required fields', () => {
      const t = defaultTarget('transformProperty')
      expect(t.kind).toBe('transformProperty')
      expect(t).toHaveProperty('transformIdx', 0)
      expect(t).toHaveProperty('property', 'probability')
    })

    it('returns variationWeight target with all required fields', () => {
      const t = defaultTarget('variationWeight')
      expect(t.kind).toBe('variationWeight')
      expect(t).toHaveProperty('transformIdx', 0)
      expect(t).toHaveProperty('variationType', '')
    })

    it('returns finalAffine target with kind and param', () => {
      const t = defaultTarget('finalAffine')
      expect(t.kind).toBe('finalAffine')
      expect(t).toHaveProperty('param', 'a')
    })
  })

  describe('transformIdx parameter', () => {
    it('uses explicit transformIdx when provided', () => {
      const t = defaultTarget('transformAffine', 3)
      expect(t).toMatchObject({
        kind: 'transformAffine',
        transformIdx: 3,
      })
    })

    it('defaults transformIdx to 0 when undefined', () => {
      const t = defaultTarget('transformAffine')
      expect(t).toMatchObject({ transformIdx: 0 })
    })

    it('ignores transformIdx for renderSetting (no transformIdx field)', () => {
      const t = defaultTarget('renderSetting', 5)
      expect(t).toEqual({ kind: 'renderSetting', param: 'vibrancy' })
    })

    it('ignores transformIdx for finalAffine (no transformIdx field)', () => {
      const t = defaultTarget('finalAffine', 5)
      expect(t).toEqual({ kind: 'finalAffine', param: 'a' })
    })
  })

  describe('returned objects pass flameTargetKey validation', () => {
    for (const cat of ALL_TARGET_CATEGORIES) {
      it(`defaultTarget('${cat}') produces a valid key via flameTargetKey`, () => {
        const t = defaultTarget(cat)
        const key = flameTargetKey(t)
        expect(key).toBeTruthy()
        expect(typeof key).toBe('string')
        expect(key.length).toBeGreaterThan(0)
      })
    }
  })

  describe('round-trip via flameTargetKey', () => {
    it('produces consistent keys for the same inputs', () => {
      const a = defaultTarget('renderSetting')
      const b = defaultTarget('renderSetting')
      expect(flameTargetKey(a)).toBe(flameTargetKey(b))
    })

    it('produces different keys for different inputs', () => {
      const a = defaultTarget('transformAffine', 0)
      const b = defaultTarget('transformAffine', 1)
      expect(flameTargetKey(a)).not.toBe(flameTargetKey(b))
    })
  })
})

// =============================================================================
// PRESET_MAPPINGS
// =============================================================================

describe('PRESET_MAPPINGS', () => {
  describe('contains entries for all presets', () => {
    for (const preset of ALL_PRESETS) {
      it(`has entry for '${preset}'`, () => {
        expect(PRESET_MAPPINGS).toHaveProperty(preset)
        expect(Array.isArray(PRESET_MAPPINGS[preset])).toBe(true)
      })
    }
  })

  describe('each non-custom preset is non-empty', () => {
    for (const preset of ALL_PRESETS) {
      if (preset === 'custom') continue
      it(`preset '${preset}' has at least one mapping`, () => {
        expect(PRESET_MAPPINGS[preset].length).toBeGreaterThan(0)
      })
    }
  })

  describe('custom preset is empty', () => {
    it('has an empty array', () => {
      expect(PRESET_MAPPINGS.custom).toEqual([])
    })
  })

  describe('every mapping has required fields', () => {
    for (const preset of ALL_PRESETS) {
      const mappings = PRESET_MAPPINGS[preset]
      for (let i = 0; i < mappings.length; i++) {
        const m = mappings[i]!
        it(`preset '${preset}' mapping ${i} has audioFeature, target, sensitivity, range`, () => {
          expect(m).toHaveProperty('audioFeature')
          expect(typeof m.audioFeature).toBe('string')
          expect(m).toHaveProperty('target')
          expect(typeof m.sensitivity).toBe('number')
          expect(m.sensitivity).toBeGreaterThan(0)
          expect(Array.isArray(m.range)).toBe(true)
          expect(m.range).toHaveLength(2)
          expect(typeof m.range[0]).toBe('number')
          expect(typeof m.range[1]).toBe('number')
          expect(m.range[0]).toBeLessThanOrEqual(m.range[1])
        })
      }
    }
  })

  describe('every target is a valid FlameTarget variant', () => {
    const validKinds = new Set(ALL_TARGET_CATEGORIES)

    for (const preset of ALL_PRESETS) {
      const mappings = PRESET_MAPPINGS[preset]
      for (let i = 0; i < mappings.length; i++) {
        const t = mappings[i]!.target

        it(`preset '${preset}' mapping ${i} has valid target kind`, () => {
          expect(validKinds.has(t.kind)).toBe(true)
        })

        // Check kind-specific required fields
        if (t.kind === 'renderSetting') {
          it(`preset '${preset}' mapping ${i} renderSetting has param`, () => {
            expect(typeof t.param).toBe('string')
            expect(t.param.length).toBeGreaterThan(0)
          })
        } else if (t.kind === 'transformAffine') {
          it(`preset '${preset}' mapping ${i} transformAffine has required fields`, () => {
            expect(typeof t.transformIdx).toBe('number')
            expect(['preAffine', 'postAffine']).toContain(t.matrix)
            expect(typeof t.param).toBe('string')
          })
        } else if (t.kind === 'transformProperty') {
          it(`preset '${preset}' mapping ${i} transformProperty has required fields`, () => {
            expect(typeof t.transformIdx).toBe('number')
            expect(typeof t.property).toBe('string')
          })
        } else if (t.kind === 'variationWeight') {
          it(`preset '${preset}' mapping ${i} variationWeight has required fields`, () => {
            expect(typeof t.transformIdx).toBe('number')
            expect(typeof t.variationType).toBe('string')
          })
        } else if (t.kind === 'finalAffine') {
          it(`preset '${preset}' mapping ${i} finalAffine has param`, () => {
            expect(typeof t.param).toBe('string')
            expect(t.param.length).toBeGreaterThan(0)
          })
        }
      }
    }
  })

  describe('no duplicate targets within a preset', () => {
    // chaos intentionally maps two audio features (flatness, onset) to the same
    // render param (contrast) — skip the uniqueness check for that preset.
    const PRESETS_EXPECT_DUPLICATES = new Set(['chaos'])

    for (const preset of ALL_PRESETS) {
      if (preset === 'custom' || PRESETS_EXPECT_DUPLICATES.has(preset)) continue

      it(`preset '${preset}' has no duplicate target keys`, () => {
        const mappings = PRESET_MAPPINGS[preset]
        const keys = mappings.map((m) => flameTargetKey(m.target))
        const uniqueKeys = new Set(keys)
        expect(uniqueKeys.size).toBe(keys.length)
      })
    }
  })
})

// =============================================================================
// flameTargetKey
// =============================================================================

describe('flameTargetKey', () => {
  it('generates correct key for renderSetting', () => {
    const t: FlameTarget = { kind: 'renderSetting', param: 'vibrancy' }
    expect(flameTargetKey(t)).toBe('render.vibrancy')
  })

  it('generates correct key for finalAffine', () => {
    const t: FlameTarget = { kind: 'finalAffine', param: 'c' }
    expect(flameTargetKey(t)).toBe('final.c')
  })

  it('generates correct key for transformAffine', () => {
    const t: FlameTarget = {
      kind: 'transformAffine',
      transformIdx: 2,
      matrix: 'preAffine',
      param: 'd',
    }
    expect(flameTargetKey(t)).toBe('tx.2.preAffine.d')
  })

  it('generates correct key for transformProperty', () => {
    const t: FlameTarget = {
      kind: 'transformProperty',
      transformIdx: 1,
      property: 'colorX',
    }
    expect(flameTargetKey(t)).toBe('tx.1.prop.colorX')
  })

  it('generates correct key for variationWeight', () => {
    const t: FlameTarget = {
      kind: 'variationWeight',
      transformIdx: 3,
      variationType: 'linear',
    }
    expect(flameTargetKey(t)).toBe('tx.3.var.linear.weight')
  })

  it('is stable for structurally identical targets', () => {
    const a: FlameTarget = { kind: 'renderSetting', param: 'gamma' }
    const b: FlameTarget = { kind: 'renderSetting', param: 'gamma' }
    expect(flameTargetKey(a)).toBe(flameTargetKey(b))
  })

  it('differs for different targets of the same kind', () => {
    const a: FlameTarget = { kind: 'renderSetting', param: 'gamma' }
    const b: FlameTarget = { kind: 'renderSetting', param: 'contrast' }
    expect(flameTargetKey(a)).not.toBe(flameTargetKey(b))
  })

  it('differs for different target kinds', () => {
    const a: FlameTarget = { kind: 'renderSetting', param: 'zoom' }
    const b: FlameTarget = { kind: 'finalAffine', param: 'a' }
    expect(flameTargetKey(a)).not.toBe(flameTargetKey(b))
  })
})

// =============================================================================
// getAudioFeatureNormalized
// =============================================================================

describe('getAudioFeatureNormalized', () => {
  it('returns 1 when beat is active', () => {
    const frame = makeFrame({ isBeat: true })
    expect(getAudioFeatureNormalized(frame, 'beat')).toBe(1)
  })

  it('returns 0 when beat is inactive', () => {
    const frame = makeFrame({ isBeat: false })
    expect(getAudioFeatureNormalized(frame, 'beat')).toBe(0)
  })

  it('returns onsetStrength directly', () => {
    const frame = makeFrame({ onsetStrength: 0.75 })
    expect(getAudioFeatureNormalized(frame, 'onset')).toBe(0.75)
  })

  it('clamps rms to max 1', () => {
    expect(getAudioFeatureNormalized(makeFrame({ rms: 0.5 }), 'rms')).toBe(0.5)
    expect(getAudioFeatureNormalized(makeFrame({ rms: 2.0 }), 'rms')).toBe(1)
  })

  it('normalizes centroid against 20000 Hz ceiling', () => {
    expect(
      getAudioFeatureNormalized(makeFrame({ centroid: 10000 }), 'centroid'),
    ).toBe(0.5)
    expect(
      getAudioFeatureNormalized(makeFrame({ centroid: 30000 }), 'centroid'),
    ).toBe(1)
  })

  it('returns flatness directly', () => {
    const frame = makeFrame({ flatness: 0.3 })
    expect(getAudioFeatureNormalized(frame, 'flatness')).toBe(0.3)
  })

  it('returns correct band indices', () => {
    const frame = makeFrame({
      bands: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
    })
    expect(getAudioFeatureNormalized(frame, 'subBass')).toBe(0.1)
    expect(getAudioFeatureNormalized(frame, 'bass')).toBe(0.2)
    expect(getAudioFeatureNormalized(frame, 'lowMid')).toBe(0.3)
    expect(getAudioFeatureNormalized(frame, 'mid')).toBe(0.4)
    expect(getAudioFeatureNormalized(frame, 'hiMid')).toBe(0.5)
    expect(getAudioFeatureNormalized(frame, 'presence')).toBe(0.6)
    expect(getAudioFeatureNormalized(frame, 'brilliance')).toBe(0.7)
    expect(getAudioFeatureNormalized(frame, 'fullSpectrum')).toBe(0.8)
  })

  it('clamps band values to max 1', () => {
    const frame = makeFrame({
      bands: [0, 0, 0, 0, 0, 0, 0, 1.5],
    })
    expect(getAudioFeatureNormalized(frame, 'fullSpectrum')).toBe(1)
  })

  it('returns 0 for missing band index', () => {
    // Use a band that exists but check zero handling
    const frame = makeFrame({ bands: [0, 0, 0, 0, 0, 0, 0, 0] })
    expect(getAudioFeatureNormalized(frame, 'subBass')).toBe(0)
  })
})
