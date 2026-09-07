import { describe, expect, it } from 'vitest'
import { calculateGroundedStats, classifySchool, getSchoolMultiplier, resolveClashCombat, } from './stats'
import type { FlameDescriptor } from './schema/flameSchema'

function createDummyFlame(
  variationName = 'linearVar',
  weight = 1.0,
  isCustom = false,
): FlameDescriptor {
  return {
    version: '1.0',
    metadata: { author: 'test', name: 'Test Flame', description: '' },
    renderSettings: {
      exposure: 0.3,
      skipIters: 20,
      plotsPerChain: 16,
      autoExposure3D: false,
      autoExposure3DStrength: 1,
      autoExposure3DRefRadius: 5,
      autoExposure3DBase: 0,
      dimensions: 2,
      drawMode: 'light',
      colorInitMode: 'colorInitZero',
      pointInitMode: 'pointInitUnitDisk',
      vibrancy: 0.5,
      contrast: 1,
      gamma: 2.2,
      depthColorPower: 0,
      lightDirection: [-0.5, 0.5, -1],
      lightPower: 0,
      highlightPower: 0.5,
      densityEstimationQuality: 0.8,
      estimatorCurve: 0.5,
      paletteMode: 0,
      palettePhase: 0,
      paletteSpeed: 0.5,
      camera: { zoom: 1, position: [0, 0], rotation: 0 },
    },
    transforms: {
      t1: {
        probability: 0.5,
        color: { x: 0.2, y: 0.5 },
        colorSpeed: 0.5,
        visible: true,
        preAffine: { a: 0.7, b: 0.1, c: -0.1, d: 0.7, e: 0, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        variations: { [variationName]: { type: variationName, weight } },
        customVariations: isCustom
          ? {
              custom1: {
                name: 'custom_warp',
                definition: 'fn custom_warp(p: vec2f) -> vec2f { return p; }',
                weight: 1.0,
              },
            }
          : undefined,
      },
      t2: {
        probability: 0.5,
        color: { x: 0.8, y: 0.5 },
        colorSpeed: 0.5,
        visible: true,
        preAffine: { a: -0.1, b: 0.7, c: -0.7, d: -0.1, e: 0, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        variations: { [variationName]: { type: variationName, weight } },
      },
    },
  } as unknown as FlameDescriptor
}

describe('flame/stats', () => {
  describe('classifySchool', () => {
    it('classifies Linear as Order', () => {
      const f = createDummyFlame('linearVar', 1.0)
      expect(classifySchool(f)).toBe('Order')
    })

    it('classifies Julia / Polar as Crystal', () => {
      const f = createDummyFlame('juliaVar', 1.0)
      expect(classifySchool(f)).toBe('Crystal')
    })

    it('classifies Swirl / Spiral as Vortex', () => {
      const f = createDummyFlame('swirlVar', 1.0)
      expect(classifySchool(f)).toBe('Vortex')
    })

    it('classifies Spherical / Bubble as Void', () => {
      const f = createDummyFlame('sphericalVar', 1.0)
      expect(classifySchool(f)).toBe('Void')
    })

    it('classifies Sinusoidal / Waves as Tide', () => {
      const f = createDummyFlame('sinusoidalVar', 1.0)
      expect(classifySchool(f)).toBe('Tide')
    })

    it('classifies Custom variation as Arcane', () => {
      const f = createDummyFlame('linearVar', 1.0, true)
      expect(classifySchool(f)).toBe('Arcane')
    })
  })

  describe('getSchoolMultiplier', () => {
    it('enforces advantage cycle', () => {
      expect(getSchoolMultiplier('Vortex', 'Order')).toBe(1.25)
      expect(getSchoolMultiplier('Order', 'Vortex')).toBe(0.8)

      expect(getSchoolMultiplier('Order', 'Void')).toBe(1.25)
      expect(getSchoolMultiplier('Void', 'Order')).toBe(0.8)

      expect(getSchoolMultiplier('Void', 'Crystal')).toBe(1.25)
      expect(getSchoolMultiplier('Crystal', 'Void')).toBe(0.8)

      expect(getSchoolMultiplier('Crystal', 'Tide')).toBe(1.25)
      expect(getSchoolMultiplier('Tide', 'Crystal')).toBe(0.8)

      expect(getSchoolMultiplier('Tide', 'Vortex')).toBe(1.25)
      expect(getSchoolMultiplier('Vortex', 'Tide')).toBe(0.8)
    })

    it('gives Arcane neutral flat bonus', () => {
      expect(getSchoolMultiplier('Arcane', 'Order')).toBe(1.1)
      expect(getSchoolMultiplier('Arcane', 'Vortex')).toBe(1.1)
      expect(getSchoolMultiplier('Order', 'Arcane')).toBe(1.0)
    })
  })

  describe('calculateGroundedStats', () => {
    it('computes grounded stats with positive HP, ATK, DEF, and valid school', () => {
      const f = createDummyFlame('juliaVar', 1.2)
      const stats = calculateGroundedStats(f)

      expect(stats.school).toBe('Crystal')
      expect(stats.dimension).toBeGreaterThan(0.5)
      expect(stats.dimension).toBeLessThanOrEqual(2.0)
      expect(stats.stability).toBeGreaterThanOrEqual(0.0)
      expect(stats.stability).toBeLessThanOrEqual(1.0)
      expect(stats.entropy).toBeGreaterThanOrEqual(0.0)
      expect(stats.nonlinearity).toBeGreaterThan(0.0)
      expect(stats.hp).toBeGreaterThan(100)
      expect(stats.atk).toBeGreaterThan(0)
      expect(stats.def).toBeGreaterThan(0)
      expect(stats.powerLevel).toBeGreaterThan(0)
    })
  })

  describe('resolveClashCombat', () => {
    it('deterministically resolves 3 rounds with battle log', () => {
      const f1 = createDummyFlame('swirlVar', 1.5)
      const f2 = createDummyFlame('linearVar', 1.0)

      const res1 = resolveClashCombat({
        nameA: 'Vortex Warrior',
        nameB: 'Order Knight',
        flameA: f1,
        flameB: f2,
        stanceA: 'entropy',
        stanceB: 'bastion',
        rounds: 3,
        seed: 12345,
      })

      const res2 = resolveClashCombat({
        nameA: 'Vortex Warrior',
        nameB: 'Order Knight',
        flameA: f1,
        flameB: f2,
        stanceA: 'entropy',
        stanceB: 'bastion',
        rounds: 3,
        seed: 12345,
      })

      expect(res1.winner).toBe(res2.winner)
      expect(res1.finalHp.A).toBe(res2.finalHp.A)
      expect(res1.finalHp.B).toBe(res2.finalHp.B)
      expect(res1.rounds.length).toBe(3)
      expect(res1.battleLog.length).toBeGreaterThan(4)
      expect(res1.schoolMultiplierA).toBe(1.25) // Vortex vs Order
    })
  })
})
