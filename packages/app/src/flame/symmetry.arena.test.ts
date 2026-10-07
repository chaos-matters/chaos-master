/**
 * What Flame Clash computes from a fighter after its C1-C8 symmetry buttons.
 *
 * `handleApplySymmetry` in ArenaOverlay runs `applySymmetryToFlame(flame, n,
 * 'rotational')`, then shows `calculateFlameStats` (the Complexity, Chaos,
 * Symmetry and Energy rows) and `calculateGroundedStats` (Power, the Dim /
 * Stab / Ent / Sym strip, and the champion card's HP / ATK / DEF). A clash
 * then runs `simulateClash` on the two fighters.
 *
 * Each table pins those values per fold for one fighter, so a change to what
 * the symmetry transforms carry shows up here as the exact rows that moved.
 */
import { describe, expect, it } from 'vitest'
import { calculateGroundedStats } from '@/flame/stats'
import { calculateFlameStats } from '@/webmcp/tools/scoreFlame'
import { simulateClash } from '@/webmcp/tools/simulateClash'
import { applySymmetryToFlame } from './symmetry'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { SimulateClashResult } from '@/webmcp/tools/simulateClash'

const renderSettings2D = {
  dimensions: 2,
  exposure: 0.25,
  vibrancy: 0.5,
  camera: { zoom: 1, position: [0, 0], rotation: 0 },
}

function transform2D(
  preAffine: Record<string, number>,
  variations: Record<string, { type: string; weight: number }>,
  probability: number,
) {
  return {
    probability,
    preAffine,
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: 0.3, y: 0.6 },
    colorSpeed: 0.4,
    visible: true,
    variations: Object.fromEntries(
      Object.entries(variations).map(([id, v]) => [
        id,
        { ...v, visible: true },
      ]),
    ),
  }
}

/** A 2D fighter whose own transforms already use `linearVar`. */
const FIGHTER_2D_LINEAR = {
  version: '1.0',
  metadata: { author: 'test', name: 'Linear Fighter', description: '' },
  renderSettings: renderSettings2D,
  transforms: {
    t1: transform2D(
      { a: 0.6, b: -0.2, c: 0.3, d: 0.2, e: 0.6, f: -0.1 },
      { v1: { type: 'linearVar', weight: 1 } },
      0.6,
    ),
    t2: transform2D(
      { a: 0.4, b: 0.3, c: -0.4, d: -0.3, e: 0.4, f: 0.2 },
      { v2: { type: 'sphericalVar', weight: 0.8 } },
      0.4,
    ),
  },
} as unknown as FlameDescriptor

/** A 2D fighter with no linear variation of its own. */
const FIGHTER_2D_CURVED = {
  version: '1.0',
  metadata: { author: 'test', name: 'Curved Fighter', description: '' },
  renderSettings: renderSettings2D,
  transforms: {
    t1: transform2D(
      { a: 0.5, b: 0.1, c: 0.2, d: -0.1, e: 0.5, f: 0.3 },
      { v1: { type: 'swirlVar', weight: 1 } },
      0.5,
    ),
    t2: transform2D(
      { a: 0.3, b: -0.4, c: -0.2, d: 0.4, e: 0.3, f: 0 },
      { v2: { type: 'sphericalVar', weight: 0.6 } },
      0.5,
    ),
  },
} as unknown as FlameDescriptor

const identity3D = {
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
}

/** A 3D fighter, whose symmetry transforms already carry `linear3D`. */
const FIGHTER_3D = {
  version: '1.0',
  metadata: { author: 'test', name: '3D Fighter', description: '' },
  renderSettings: { ...renderSettings2D, dimensions: 3 },
  transforms: {
    t1: {
      probability: 0.6,
      preAffine: { ...identity3D, a: 0.6, b: -0.2, e: 0.2, f: 0.6, k: 0.6 },
      postAffine: identity3D,
      color: { x: 0.3, y: 0.6 },
      colorSpeed: 0.4,
      visible: true,
      variations: { v1: { type: 'linear3D', weight: 1, visible: true } },
    },
    t2: {
      probability: 0.4,
      preAffine: { ...identity3D, a: 0.4, d: 0.3, f: 0.4, k: 0.4 },
      postAffine: identity3D,
      color: { x: 0.7, y: 0.2 },
      colorSpeed: 0.4,
      visible: true,
      variations: { v2: { type: 'spherical3D', weight: 0.8, visible: true } },
    },
  },
} as unknown as FlameDescriptor

const FOLDS = [1, 2, 3, 4, 5, 6, 7, 8] as const

/**
 * [folds, score power, complexity, chaos, symmetry score, energy,
 *  symmetry order, hp, def, crit %, dimension, nonlinearity]
 */
function sheetRow(flame: FlameDescriptor, folds: number) {
  const sym = applySymmetryToFlame(flame, folds, 'rotational')
  const score = calculateFlameStats(sym)
  const grounded = calculateGroundedStats(sym)
  return [
    folds,
    score.powerLevel,
    score.metrics.complexity,
    score.metrics.chaosLevel,
    score.metrics.symmetryScore,
    score.metrics.energyIntensity,
    grounded.symmetryOrder,
    grounded.hp,
    grounded.def,
    Math.round(grounded.critChance * 100),
    grounded.dimension,
    grounded.nonlinearity,
  ]
}

/** [folds, beauty, atk, grounded power] — the card's Power row. */
function powerRow(flame: FlameDescriptor, folds: number) {
  const grounded = calculateGroundedStats(
    applySymmetryToFlame(flame, folds, 'rotational'),
  )
  return [folds, grounded.beauty, grounded.atk, grounded.powerLevel]
}

function school(flame: FlameDescriptor, folds: number) {
  return calculateGroundedStats(
    applySymmetryToFlame(flame, folds, 'rotational'),
  ).school
}

describe('Arena symmetry: the stat sheet per fold', () => {
  describe('2D fighter that already uses linearVar', () => {
    it('score sheet, symmetry order, HP and DEF', () => {
      expect(FOLDS.map((n) => sheetRow(FIGHTER_2D_LINEAR, n))).toEqual([
        [1, 740, 1.4, 1.2, 0, 3.5, 1, 160, 30, 39, 1.22, 0.41],
        [2, 930, 2.1, 1.2, 2.5, 2.8, 2, 150, 31, 38, 2, 0.3],
        [3, 1060, 2.8, 1.2, 3.8, 2.5, 3, 145, 34, 38, 2, 0.25],
        [4, 1206, 3.5, 1.2, 5, 2.3, 4, 142, 37, 39, 2, 0.22],
        [5, 1360, 4.2, 1.2, 6.3, 2.2, 5, 140, 40, 39, 2, 0.2],
        [6, 1519, 4.9, 1.2, 7.5, 2.1, 6, 139, 44, 39, 2, 0.18],
        [7, 1680, 5.6, 1.2, 8.8, 2, 7, 138, 48, 39, 2, 0.17],
        [8, 1843, 6.3, 1.2, 10, 1.9, 8, 137, 46, 39, 2, 0.16],
      ])
    })

    // Beauty's variation-diversity term counts types. The symmetry
    // transforms carry linearVar, the type this fighter already has; before,
    // their unregistered 'linear' counted as one more type.
    it('beauty, ATK and Power', () => {
      expect(FOLDS.map((n) => powerRow(FIGHTER_2D_LINEAR, n))).toEqual([
        [1, 37, 25, 1008],
        [2, 60, 38, 1180],
        [3, 64, 39, 1207],
        [4, 62, 38, 1200],
        [5, 59, 37, 1192],
        [6, 54, 35, 1177],
        [7, 50, 33, 1166],
        [8, 46, 31, 1119],
      ])
    })

    // linearVar (1) against sphericalVar (0.8), and one linearVar (1) per
    // symmetry transform.
    it('school', () => {
      expect(FOLDS.map((n) => school(FIGHTER_2D_LINEAR, n))).toEqual([
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
      ])
    })
  })

  describe('2D fighter with no linear variation', () => {
    it('score sheet, symmetry order, HP and DEF', () => {
      expect(FOLDS.map((n) => sheetRow(FIGHTER_2D_CURVED, n))).toEqual([
        [1, 920, 1.4, 2.4, 0, 3.5, 1, 165, 33, 40, 1.01, 0.8],
        [2, 1110, 2.1, 2.4, 2.5, 2.8, 2, 153, 33, 38, 2, 0.58],
        [3, 1240, 2.8, 2.4, 3.8, 2.5, 3, 147, 35, 38, 2, 0.46],
        [4, 1386, 3.5, 2.4, 5, 2.3, 4, 144, 39, 39, 2, 0.39],
        [5, 1540, 4.2, 2.4, 6.3, 2.2, 5, 142, 42, 39, 2, 0.35],
        [6, 1699, 4.9, 2.4, 7.5, 2.1, 6, 140, 45, 39, 2, 0.32],
        [7, 1860, 5.6, 2.4, 8.8, 2, 7, 139, 49, 39, 2, 0.3],
        [8, 2023, 6.3, 2.4, 10, 1.9, 8, 138, 48, 40, 2, 0.28],
      ])
    })

    it('beauty, ATK and Power', () => {
      expect(FOLDS.map((n) => powerRow(FIGHTER_2D_CURVED, n))).toEqual([
        [1, 41, 27, 1073],
        [2, 65, 41, 1245],
        [3, 70, 43, 1275],
        [4, 67, 41, 1262],
        [5, 64, 40, 1254],
        [6, 59, 38, 1230],
        [7, 55, 36, 1219],
        [8, 51, 34, 1178],
      ])
    })

    // swirlVar (1, Vortex) against sphericalVar (0.6, Void), and one linearVar
    // (1, Order) per symmetry transform. C2 is a tie, 1 against 1, which
    // classifySchool gives to the school listed first: Vortex before Order.
    it('school', () => {
      expect(FOLDS.map((n) => school(FIGHTER_2D_CURVED, n))).toEqual([
        'Vortex',
        'Vortex',
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
      ])
    })
  })

  describe('3D fighter', () => {
    it('score sheet, symmetry order, HP and DEF', () => {
      expect(FOLDS.map((n) => sheetRow(FIGHTER_3D, n))).toEqual([
        [1, 900, 1.4, 1.2, 2, 3.5, 1, 164, 32, 39, 1.03, 0.41],
        [2, 930, 2.1, 1.2, 2.5, 2.8, 2, 153, 33, 38, 3, 0.3],
        [3, 1060, 2.8, 1.2, 3.8, 2.5, 3, 147, 35, 38, 3, 0.25],
        [4, 1206, 3.5, 1.2, 5, 2.3, 4, 144, 39, 39, 3, 0.22],
        [5, 1360, 4.2, 1.2, 6.3, 2.2, 5, 141, 41, 39, 3, 0.2],
        [6, 1519, 4.9, 1.2, 7.5, 2.1, 6, 140, 45, 39, 3, 0.18],
        [7, 1680, 5.6, 1.2, 8.8, 2, 7, 138, 48, 39, 3, 0.17],
        [8, 1843, 6.3, 1.2, 10, 1.9, 8, 138, 48, 39, 3, 0.16],
      ])
    })

    it('beauty, ATK and Power', () => {
      expect(FOLDS.map((n) => powerRow(FIGHTER_3D, n))).toEqual([
        [1, 62, 31, 1180],
        [2, 63, 39, 1221],
        [3, 66, 40, 1235],
        [4, 61, 38, 1214],
        [5, 58, 36, 1189],
        [6, 53, 34, 1174],
        [7, 48, 32, 1150],
        [8, 44, 31, 1126],
      ])
    })

    // linear3D (1, Order) against spherical3D (0.8, on the symmetry list, so
    // Crystal), and one linear3D (1) per symmetry transform.
    it('school', () => {
      expect(FOLDS.map((n) => school(FIGHTER_3D, n))).toEqual([
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
        'Order',
      ])
    })
  })
})

/**
 * The clash as the Arena runs it: P1's dimensions, three rounds, P1's stance
 * against a balanced P2. Territory decides the winner; the combat log's HP
 * comes from the grounded ATK and DEF above.
 */
function clash(p1: FlameDescriptor, p2: FlameDescriptor) {
  const res = simulateClash.execute(
    {
      flameA: applySymmetryToFlame(p1, 4, 'rotational'),
      flameB: p2,
      dimensions: p1.renderSettings.dimensions,
      rounds: 3,
      stanceA: 'balanced',
      stanceB: 'balanced',
    },
    {},
  ) as SimulateClashResult
  return {
    winner: res.winner,
    territory: res.rounds.map((r) => [
      r.winner,
      Number(r.ownershipA.toFixed(3)),
      Number(r.ownershipB.toFixed(3)),
    ]),
    finalScore: res.finalScore,
    combatHp: res.combat?.finalHp,
    combatScore: res.combat?.finalScore,
  }
}

describe('Arena symmetry: a clash after C4', () => {
  it('2D: C4 linear fighter against the curved fighter', () => {
    expect(clash(FIGHTER_2D_LINEAR, FIGHTER_2D_CURVED)).toEqual({
      winner: 'A',
      territory: [
        ['A', 0.82, 0.176],
        ['A', 0.866, 0.13],
        ['A', 0.905, 0.091],
      ],
      finalScore: { A: 3, B: 0 },
      combatHp: { A: 70, B: 101 },
      combatScore: { A: 1, B: 2 },
    })
  })

  it('3D: C4 fighter against itself without symmetry', () => {
    expect(clash(FIGHTER_3D, FIGHTER_3D)).toEqual({
      winner: 'A',
      territory: [
        ['A', 0.823, 0.173],
        ['A', 0.869, 0.128],
        ['A', 0.907, 0.089],
      ],
      finalScore: { A: 3, B: 0 },
      combatHp: { A: 84, B: 73 },
      combatScore: { A: 2, B: 1 },
    })
  })
})
