import { describe, expect, it } from 'vitest'
import { deepClone } from '@/utils/clone'
import { cantorDust, heighwayDragon, kochCurve, mengerSponge, sierpinskiCarpet, sierpinskiTetrahedron, sierpinskiTriangle, } from './examples/classics'
import { example30 } from './examples/example30'
import { LINEAR_VARIATIONS, SYMMETRY_VARIATIONS, TIDE_VARIATIONS, VOID_VARIATIONS, VORTEX_VARIATIONS, } from './schoolVariations'
import { calculateGroundedStats, classifySchool, COMBAT_COEFFICIENTS, getSchoolMultiplier, resolveClashCombat, } from './stats'
import { generateVariationId } from './transformFunction'
import { VARIATION_2D_TO_3D_MAP } from './transformFunction3D'
import { isVariationTypeFor } from './variationRegistry'
import type { FlameDescriptor } from './schema/flameSchema'
import type { GroundedFlameStats } from './stats'

/**
 * A custom variation's type, as the editor writes it: `custom_` and the
 * variation's own id. The variation entry itself gets a generated id.
 */
const CUSTOM_TYPE = 'custom_5d0c2a4e_91b7_4f3a_a8e6_0b2f7c9d1e34'

/**
 * Two transforms carrying one variation of `variationType` each, under ids
 * the way the editor mints them (`generateVariationId()`), never the type
 * name: a scorer that looks a variation up by its key sees what it sees on
 * a real flame.
 */
function createDummyFlame(
  variationType = 'linearVar',
  weight = 1.0,
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
        variations: {
          [generateVariationId()]: { type: variationType, weight },
        },
      },
      t2: {
        probability: 0.5,
        color: { x: 0.8, y: 0.5 },
        colorSpeed: 0.5,
        visible: true,
        preAffine: { a: -0.1, b: 0.7, c: -0.7, d: -0.1, e: 0, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        variations: {
          [generateVariationId()]: { type: variationType, weight },
        },
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

    // spherical3D and sphere3D sat on the Crystal and the Void list, and the
    // Crystal check comes first, while 2D's sphericalVar is Void.
    it('classifies the 3D spherical variations as Void, as sphericalVar is', () => {
      for (const type of ['spherical3D', 'sphere3D']) {
        const f = createDummyFlame(type, 1.0)
        f.renderSettings.dimensions = 3
        expect([type, classifySchool(f)]).toEqual([type, 'Void'])
      }
    })

    // A 3D flame draws a live row of the 2D-to-3D map's 2D name as its 3D
    // analog, so a variation counts as what is drawn, and each school holds
    // the analogs of its 2D entries: bubble3D was on no list, bubbleVar Void.
    // The 3D registry also has name twins the map does not list (waves3D for
    // wavesVar), and a 3D flame built from 3D names uses them: each sits
    // with its 2D twin too. waves3D read Order while wavesVar read Tide.
    it('classifies each 3D analog as its 2D name: map rows and name twins', () => {
      const liveRows = Object.entries(VARIATION_2D_TO_3D_MAP).filter(
        ([from, to]) =>
          isVariationTypeFor(2, from) && isVariationTypeFor(3, to),
      )
      const listed2D = [
        LINEAR_VARIATIONS,
        SYMMETRY_VARIATIONS,
        VORTEX_VARIATIONS,
        VOID_VARIATIONS,
        TIDE_VARIATIONS,
      ]
        .flatMap((list) => [...list])
        .filter((type) => type.endsWith('Var') && isVariationTypeFor(2, type))
      const nameTwins = listed2D
        .map((type) => [type, type.replace(/Var$/, '3D')] as const)
        .filter(([, twin]) => isVariationTypeFor(3, twin))
      const pairs = [
        ...new Map(
          [...liveRows, ...nameTwins].map(([from, to]) => [
            `${from} ${to}`,
            [from, to] as const,
          ]),
        ).values(),
      ]
      const as3D = (type: string) => {
        const f = createDummyFlame(type, 1.0)
        f.renderSettings.dimensions = 3
        return classifySchool(f)
      }
      const rows = pairs.map(([from, to]) => [
        `${from} ${classifySchool(createDummyFlame(from, 1.0))}`,
        `${from} in 3D ${as3D(from)}`,
        `${to} in 3D ${as3D(to)}`,
      ])
      expect(liveRows.length).toBeGreaterThan(0)
      expect(nameTwins.length).toBeGreaterThan(0)
      expect(
        rows.filter(
          (row) => new Set(row.map((r) => r.split(' ').pop())).size > 1,
        ),
      ).toEqual([])
    })

    // The checks run in order, so a type on two lists counts for the first
    // only: spherical3D sat on the symmetry list and on Void's, and read
    // Crystal where sphericalVar reads Void. The 3D analogs the map adds must
    // not land on a second list either.
    it('puts a type on one school list at most', () => {
      const lists = [
        LINEAR_VARIATIONS,
        SYMMETRY_VARIATIONS,
        VORTEX_VARIATIONS,
        VOID_VARIATIONS,
        TIDE_VARIATIONS,
      ]
      const types = lists.flatMap((list) => [...list])
      expect(types.filter((t, i) => types.indexOf(t) !== i)).toEqual([])
    })

    it('classifies Sinusoidal / Waves as Tide', () => {
      const f = createDummyFlame('sinusoidalVar', 1.0)
      expect(classifySchool(f)).toBe('Tide')
    })

    it('classifies Custom variation as Arcane', () => {
      const f = createDummyFlame(CUSTOM_TYPE, 1.0)
      expect(classifySchool(f)).toBe('Arcane')
    })

    // arena_get_stats scores an agent's flame unvalidated. A variation with
    // no type counts like an unknown one (half its weight to Order) instead
    // of throwing.
    it('reads a variation with no type as an unknown type', () => {
      const f = createDummyFlame('juliaVar', 1.0)
      const first = Object.values(f.transforms)[0]!
      for (const variation of Object.values(first.variations)) {
        delete (variation as { type?: string }).type
      }
      expect(classifySchool(f)).toBe('Crystal')
      expect(calculateGroundedStats(f).school).toBe('Crystal')
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

  // The bundled classic IFS are exactly self-similar, so the Moran equation
  // over their contraction ratios gives their known dimension: the ground
  // truth for the estimator. It rounds to two decimals, so it may be off by
  // up to 0.005 (toBeCloseTo(x, 2)).
  describe('calculateGroundedStats: dimension and stability', () => {
    const dimensionOf = (flame: FlameDescriptor) =>
      calculateGroundedStats(flame).dimension

    it('2D: the classics', () => {
      expect(dimensionOf(sierpinskiTriangle)).toBeCloseTo(Math.log2(3), 2)
      expect(dimensionOf(sierpinskiCarpet)).toBeCloseTo(
        Math.log(8) / Math.log(3),
        2,
      )
      expect(dimensionOf(kochCurve)).toBeCloseTo(Math.log(4) / Math.log(3), 2)
      expect(dimensionOf(cantorDust)).toBeCloseTo(Math.log(4) / Math.log(3), 2)
      expect(dimensionOf(heighwayDragon)).toBe(2)
    })

    // Four maps at 1/2 and twenty at 1/3, in the 3D affine layout with the
    // translation in d, h and l.
    it('3D: the Sierpinski tetrahedron and the Menger sponge', () => {
      expect(dimensionOf(sierpinskiTetrahedron)).toBe(2)
      expect(dimensionOf(mengerSponge)).toBeCloseTo(
        Math.log(20) / Math.log(3),
        2,
      )
      // stability = 1 - 0.7 * sigma1, sigma1 the scale of every map.
      expect(calculateGroundedStats(sierpinskiTetrahedron).stability).toBe(0.65)
      expect(calculateGroundedStats(mengerSponge).stability).toBe(0.77)
    })

    // The probe from the arcade audit: example30 with only the x translation
    // of its first transform moved. Translation is not shape.
    it('3D: moving a transform changes nothing', () => {
      const moved = deepClone(example30)
      const first = Object.values(moved.transforms)[0]!
      ;(first.preAffine as unknown as { d: number }).d += 1.5
      const pick = (flame: FlameDescriptor) => {
        const g = calculateGroundedStats(flame)
        return [g.dimension, g.stability, g.hp, g.def, g.powerLevel]
      }
      expect(pick(moved)).toEqual(pick(example30))
    })

    // Singular values do not change under a rotation, so neither does
    // anything computed from them: every map of the tetrahedron composed with
    // R = Rz(0.6) Rx(0.87), a turn about an axis off every coordinate axis.
    it('3D: turning every map changes nothing', () => {
      const [ca, sa] = [Math.cos(0.6), Math.sin(0.6)]
      const [cb, sb] = [Math.cos(0.87), Math.sin(0.87)]
      const rotation = [
        [ca, -sa * cb, sa * sb],
        [sa, ca * cb, -ca * sb],
        [0, sb, cb],
      ]
      const rows = [
        ['a', 'b', 'c'],
        ['e', 'f', 'g'],
        ['i', 'j', 'k'],
      ] as const
      const turned = deepClone(sierpinskiTetrahedron)
      for (const t of Object.values(turned.transforms)) {
        const m = t.preAffine as unknown as Record<string, number>
        const linear = rows.map((row) => row.map((key) => m[key]!))
        // M' = M R
        rows.forEach((row, r) => {
          row.forEach((key, col) => {
            m[key] = linear[r]!.reduce(
              (sum, value, k) => sum + value * rotation[k]![col]!,
              0,
            )
          })
        })
      }
      const pick = (flame: FlameDescriptor) => {
        const g = calculateGroundedStats(flame)
        return [g.dimension, g.stability]
      }
      expect(pick(turned)).toEqual(pick(sierpinskiTetrahedron))
    })

    // A 3D flame can hold an affine with only a..f (a hand-built flame; a
    // loaded one is migrated). The renderer promotes it with z untouched,
    // [[a, b, 0], [d, e, 0], [0, 0, 1]], and the stats read it the same way:
    // the triangle's half-scale maps then contract by 4^(-1/3) in volume
    // terms and not at all along z.
    it('3D: a 2D-layout affine reads as the renderer promotes it', () => {
      const flat = deepClone(sierpinskiTriangle)
      flat.renderSettings.dimensions = 3
      const g = calculateGroundedStats(flat)
      expect(g.dimension).toBeCloseTo((3 * Math.log(3)) / Math.log(4), 2)
      expect(g.stability).toBe(0.3)
    })

    // The PR #124 review's probe: an identity map but for one coefficient too
    // small to square. M^T M then has a nonzero off-diagonal while the spread
    // of its diagonal, p, underflows to 0, and B = (A - q I) / p divided by 0.
    it('3D: a coefficient too small to square leaves the stats finite', () => {
      const f = deepClone(sierpinskiTetrahedron)
      const first = Object.values(f.transforms)[0]!
      Object.assign(first.preAffine, {
        ...{ a: 1, b: 2.5e-162, c: 0 },
        ...{ e: 0, f: 1, g: 0 },
        ...{ i: 0, j: 0, k: 1 },
      })
      const g = calculateGroundedStats(f)
      // sigma1 is 1 for that map and 0.5 for the other three: stability
      // 1 - 0.7 x 0.625 = 0.5625, which rounds to 0.56.
      expect(g.stability).toBe(0.56)
      expect([g.hp, g.def, g.powerLevel].every(Number.isFinite)).toBe(true)
    })

    // maff, 2026-09-24: "Normalize by space". A dimension runs up to 3 in 3D
    // and 2 in 2D, so the stats derived from it read dimension x 2 / space:
    // a 3D flame that fills its space scores like a 2D flame that fills the
    // plane. The card still shows the dimension itself.
    // cylinderVar and cylinderApoVar are two variations in 2D, but a 3D
    // flame draws both as cylinder3D: one family, not two.
    it('3D: two variations drawn as one 3D variation are one family', () => {
      const nonlinearity = (second: string) => {
        const f = createDummyFlame('cylinderVar', 1.0)
        f.renderSettings.dimensions = 3
        const t2 = Object.values(f.transforms)[1]!
        for (const v of Object.values(t2.variations)) v.type = second
        return calculateGroundedStats(f).nonlinearity
      }
      expect(nonlinearity('cylinderApoVar')).toBe(nonlinearity('cylinderVar'))
    })

    it('ATK reads the dimension per space: a filled cube scores as a filled square', () => {
      // The Menger sponge with its seven holes filled: 27 maps at 1/3 fill the
      // cube (D = 3); the carpet with its centre filled: 9 fill the square.
      const filled = (flame: FlameDescriptor, holes: number[][]) => {
        const out = deepClone(flame)
        const [first] = Object.values(out.transforms)
        holes.forEach((at, index) => {
          const t = deepClone(first!)
          const m = t.preAffine as unknown as Record<string, number>
          const [x, y, z] = at.map((n) => (2 * n) / 3)
          if (at.length === 3) [m.d, m.h, m.l] = [x!, y!, z!]
          else [m.c, m.f] = [x!, y!]
          out.transforms[`hole_${index}` as keyof typeof out.transforms] = t
        })
        return out
      }
      const cube = calculateGroundedStats(
        filled(mengerSponge, [
          [0, 0, 0],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ]),
      )
      const square = calculateGroundedStats(filled(sierpinskiCarpet, [[0, 0]]))
      expect(cube.dimension).toBe(3)
      expect(square.dimension).toBe(2)

      // ATK = 0.6 (10 D' + 10 nonlinearity) + 0.4 beauty, D' the dimension
      // per space. Both are linear maps only, so they share the nonlinearity
      // and differ in beauty alone.
      const atk = (g: GroundedFlameStats, perSpace: number) =>
        Math.round(
          COMBAT_COEFFICIENTS.ATK_GEOMETRIC_WEIGHT *
            (perSpace * 10 + g.nonlinearity * 10) +
            COMBAT_COEFFICIENTS.ATK_BEAUTY_WEIGHT * g.beauty,
        )
      expect(cube.nonlinearity).toBe(square.nonlinearity)
      expect(square.atk).toBe(atk(square, 2))
      expect(cube.atk).toBe(atk(cube, 2))
      const menger = calculateGroundedStats(mengerSponge)
      expect(menger.dimension).toBeCloseTo(Math.log(20) / Math.log(3), 2)
      expect(menger.atk).toBe(atk(menger, (menger.dimension * 2) / 3))
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
