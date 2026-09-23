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
        [1, 965, 1.4, 2.7, 0, 3.5, 1, 160, 30, 39, 1.22, 0.8],
        [2, 1380, 2.1, 4.2, 2.5, 2.8, 2, 150, 31, 38, 2, 0.85],
        [3, 1735, 2.8, 5.7, 3.8, 2.5, 3, 145, 34, 38, 2, 0.9],
        [4, 2106, 3.5, 7.2, 5, 2.3, 4, 142, 37, 39, 2, 0.95],
        [5, 2485, 4.2, 8.7, 6.3, 2.2, 5, 140, 40, 39, 2, 1],
        [6, 2839, 4.9, 10, 7.5, 2.1, 6, 139, 44, 39, 2, 1],
        [7, 3000, 5.6, 10, 8.8, 2, 7, 138, 48, 39, 2, 1],
        [8, 3163, 6.3, 10, 10, 1.9, 8, 137, 46, 39, 2, 1],
      ])
    })

    // Beauty's variation-diversity term counts types. The symmetry
    // transforms carry linearVar, the type this fighter already has; before,
    // their unregistered 'linear' counted as one more type.
    it('beauty, ATK and Power', () => {
      expect(FOLDS.map((n) => powerRow(FIGHTER_2D_LINEAR, n))).toEqual([
        [1, 37, 27, 1024],
        [2, 60, 41, 1204],
        [3, 64, 43, 1239],
        [4, 62, 43, 1240],
        [5, 59, 42, 1232],
        [6, 54, 40, 1217],
        [7, 50, 38, 1206],
        [8, 46, 36, 1159],
      ])
    })

    // Order at every fold: classifySchool keys its lists by variation id, not
    // type, so no fighter with generated ids matches any list.
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
        [2, 1335, 2.1, 3.9, 2.5, 2.8, 2, 153, 33, 38, 2, 0.85],
        [3, 1690, 2.8, 5.4, 3.8, 2.5, 3, 147, 35, 38, 2, 0.9],
        [4, 2061, 3.5, 6.9, 5, 2.3, 4, 144, 39, 39, 2, 0.95],
        [5, 2440, 4.2, 8.4, 6.3, 2.2, 5, 142, 42, 39, 2, 1],
        [6, 2824, 4.9, 9.9, 7.5, 2.1, 6, 140, 45, 39, 2, 1],
        [7, 3000, 5.6, 10, 8.8, 2, 7, 139, 49, 39, 2, 1],
        [8, 3163, 6.3, 10, 10, 1.9, 8, 138, 48, 40, 2, 1],
      ])
    })

    it('beauty, ATK and Power', () => {
      expect(FOLDS.map((n) => powerRow(FIGHTER_2D_CURVED, n))).toEqual([
        [1, 41, 27, 1073],
        [2, 65, 43, 1261],
        [3, 70, 45, 1291],
        [4, 67, 45, 1294],
        [5, 64, 44, 1286],
        [6, 59, 42, 1262],
        [7, 55, 40, 1251],
        [8, 51, 38, 1210],
      ])
    })
  })

  describe('3D fighter', () => {
    it('score sheet, symmetry order, HP and DEF', () => {
      expect(FOLDS.map((n) => sheetRow(FIGHTER_3D, n))).toEqual([
        [1, 965, 1.4, 2.7, 0, 3.5, 1, 160, 30, 39, 0.37, 0.8],
        [2, 1380, 2.1, 4.2, 2.5, 2.8, 2, 150, 31, 38, 0.52, 0.85],
        [3, 1735, 2.8, 5.7, 3.8, 2.5, 3, 135, 26, 38, 1.98, 0.9],
        [4, 2106, 3.5, 7.2, 5, 2.3, 4, 130, 26, 39, 0.68, 0.95],
        [5, 2485, 4.2, 8.7, 6.3, 2.2, 5, 130, 30, 39, 3, 1],
        [6, 2839, 4.9, 10, 7.5, 2.1, 6, 127, 30, 39, 3, 1],
        [7, 3000, 5.6, 10, 8.8, 2, 7, 127, 34, 39, 3, 1],
        [8, 3163, 6.3, 10, 10, 1.9, 8, 126, 33, 39, 3, 1],
      ])
    })

    it('beauty, ATK and Power', () => {
      expect(FOLDS.map((n) => powerRow(FIGHTER_3D, n))).toEqual([
        [1, 62, 32, 1164],
        [2, 63, 33, 1152],
        [3, 66, 44, 1177],
        [4, 61, 34, 1062],
        [5, 58, 47, 1178],
        [6, 53, 45, 1133],
        [7, 48, 43, 1121],
        [8, 44, 42, 1088],
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
        ['A', 0.872, 0.125],
        ['A', 0.909, 0.087],
        ['A', 0.938, 0.059],
      ],
      finalScore: { A: 3, B: 0 },
      combatHp: { A: 90, B: 59 },
      combatScore: { A: 2, B: 1 },
    })
  })

  it('3D: C4 fighter against itself without symmetry', () => {
    expect(clash(FIGHTER_3D, FIGHTER_3D)).toEqual({
      winner: 'A',
      territory: [
        ['A', 0.868, 0.128],
        ['A', 0.907, 0.09],
        ['A', 0.936, 0.061],
      ],
      finalScore: { A: 3, B: 0 },
      combatHp: { A: 51, B: 81 },
      combatScore: { A: 1, B: 1 },
    })
  })
})
