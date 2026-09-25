/**
 * Grounded flame stats and deterministic combat resolution for Arena Mode.
 *
 * Implements structural property analysis (Moran dimension, spectral stability,
 * Shannon entropy, nonlinearity, rotational symmetry detection) and deterministic
 * combat resolution with school advantages and tactical stances.
 */

import { scoreFlame as evaluateFlameFitness } from './fitness'
import { drawnType, LINEAR_VARIATIONS, SYMMETRY_VARIATIONS, TIDE_VARIATIONS, VOID_VARIATIONS, VORTEX_VARIATIONS, } from './schoolVariations'
import { detectSymmetryFolds } from './symmetryDetection'
import type { FlameDescriptor } from './schema/flameSchema'

export type FlameSchool =
  | 'Order'
  | 'Crystal'
  | 'Void'
  | 'Vortex'
  | 'Tide'
  | 'Arcane'

export type TacticalStance = 'balanced' | 'resonance' | 'bastion' | 'entropy'

export interface GroundedFlameStats {
  /** Moran dimension, as it is: up to 3 in 3D. ATK reads it per space. */
  dimension: number
  stability: number
  entropy: number
  nonlinearity: number
  symmetryOrder: number
  beauty: number
  school: FlameSchool
  hp: number
  maxHp: number
  atk: number
  def: number
  critChance: number
  powerLevel: number
}

export interface CombatRoundDetail {
  round: number
  dmgA: number
  dmgB: number
  isCritA: boolean
  isCritB: boolean
  hpAfterA: number
  hpAfterB: number
  roundWinner: 'A' | 'B' | 'draw'
  log: string
}

export interface ClashCombatResult {
  winner: 'A' | 'B' | 'draw'
  rounds: CombatRoundDetail[]
  finalHp: { A: number; B: number }
  finalScore: { A: number; B: number }
  battleLog: string[]
  schoolA: FlameSchool
  schoolB: FlameSchool
  schoolMultiplierA: number
  schoolMultiplierB: number
}

// PRNG for deterministic replays
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// School advantage cycle: Vortex > Order > Void > Crystal > Tide > Vortex
const SCHOOL_ADVANTAGE: Record<string, string> = {
  Vortex: 'Order',
  Order: 'Void',
  Void: 'Crystal',
  Crystal: 'Tide',
  Tide: 'Vortex',
}

/**
 * Returns combat multiplier for school matchup.
 * 1.25x for advantage, 0.8x for disadvantage, 1.1x flat for Arcane, 1.0x neutral.
 */
export function getSchoolMultiplier(
  attacker: FlameSchool,
  defender: FlameSchool,
): number {
  if (attacker === 'Arcane') return 1.1
  if (defender === 'Arcane') return 1.0
  if (SCHOOL_ADVANTAGE[attacker] === defender) return 1.25
  if (SCHOOL_ADVANTAGE[defender] === attacker) return 0.8
  return 1.0
}

export const COMBAT_COEFFICIENTS = {
  BASE_HP_MULTIPLIER: 100,
  BASE_DEFENSE_MULTIPLIER: 50,
  MAX_SYMMETRY_BOOST: 2.5,
  SYMMETRY_STEP: 0.25,
  CRIT_CHANCE_FACTOR: 0.4,
  ATK_GEOMETRIC_WEIGHT: 0.6,
  ATK_BEAUTY_WEIGHT: 0.4,
  POWER_WEIGHTS: {
    HP: 3,
    ATK: 8,
    DEF: 6,
    BEAUTY: 4,
  },
} as const

/**
 * Classify dominant school based on variation presence and custom WGSL shaders.
 */
export function classifySchool(flame: FlameDescriptor): FlameSchool {
  let orderWeight = 0
  let crystalWeight = 0
  let voidWeight = 0
  let vortexWeight = 0
  let tideWeight = 0
  let arcaneWeight = 0

  const transforms = Object.values(flame.transforms ?? {})
  if (transforms.length === 0) return 'Order'
  const spaceDim = flame.renderSettings?.dimensions === 3 ? 3 : 2

  for (const t of transforms) {
    const customVars = (t as { customVariations?: Record<string, unknown> })
      .customVariations
    if (customVars && Object.keys(customVars).length > 0) {
      arcaneWeight += 3.0
    }
    for (const vData of Object.values(t.variations ?? {})) {
      const w = Math.abs(vData.weight)
      const type = drawnType(vData, spaceDim)
      if (LINEAR_VARIATIONS.has(type)) orderWeight += w
      else if (SYMMETRY_VARIATIONS.has(type)) crystalWeight += w
      else if (VORTEX_VARIATIONS.has(type)) vortexWeight += w
      else if (VOID_VARIATIONS.has(type)) voidWeight += w
      else if (TIDE_VARIATIONS.has(type)) tideWeight += w
      else if (type.startsWith('custom_') || type.includes('custom'))
        arcaneWeight += w
      else orderWeight += w * 0.5
    }
  }

  const scores: Array<[FlameSchool, number]> = [
    ['Arcane', arcaneWeight],
    ['Vortex', vortexWeight],
    ['Void', voidWeight],
    ['Crystal', crystalWeight],
    ['Tide', tideWeight],
    ['Order', orderWeight],
  ]

  scores.sort((a, b) => b[1] - a[1])
  if (scores[0] && scores[0][1] > 0) {
    return scores[0][0]
  }
  return 'Order'
}

/**
 * Computes 2x2 singular values: returns [maxSingular, minSingular, rotationAngle, det].
 */
function analyze2x2Affine(
  a = 1,
  b = 0,
  c = 0,
  d = 1,
): { sigma1: number; sigma2: number; angle: number; det: number } {
  const det = a * d - b * c
  const tr = a * a + b * b + c * c + d * d
  const disc = Math.max(0, tr * tr - 4 * det * det)
  const root = Math.sqrt(disc)
  const l1 = Math.max(0, (tr + root) / 2)
  const l2 = Math.max(0, (tr - root) / 2)
  const sigma1 = Math.sqrt(l1)
  const sigma2 = Math.sqrt(l2)
  const angle = Math.atan2(c - b, a + d)
  return { sigma1, sigma2, angle, det }
}

const IDENTITY_2D = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }

/** What the grounded stats read from one transform's linear part. */
type LinearAnalysis = {
  /** Largest singular value: the most the map stretches any direction. */
  sigma1: number
  /** Contraction ratio for the Moran equation, clamped to [0.05, 0.98]. */
  ratio: number
  /** Rotation in the xy plane, for rotational symmetry detection. */
  angle: number
}

type AffineRecord = Record<string, number | undefined>

/**
 * A 2D affine is (a x + b y + c, d x + e y + f): the linear part is
 * [[a, b], [d, e]], and c and f translate. The ratio is sqrt(|det|), the
 * geometric mean of the two singular values, which is exactly s for a
 * similarity scaled by s.
 */
function analyzeLinear2D(aff: AffineRecord): LinearAnalysis {
  const { sigma1, det, angle } = analyze2x2Affine(
    aff.a ?? 1,
    aff.b ?? 0,
    aff.d ?? 0,
    aff.e ?? 1,
  )
  const ratio = Math.max(
    0.05,
    Math.min(0.98, Math.sqrt(Math.max(0.001, Math.abs(det)))),
  )
  return { sigma1, ratio, angle }
}

/**
 * An affine in the 3D layout carries g..l; a 2D one only a..f: the same test
 * as the renderer's `isAffine3D` (transformFunction3D.ts, which the stats
 * load anyway, through schoolVariations.ts).
 */
function isAffine3DLayout(aff: AffineRecord): boolean {
  return ['g', 'h', 'i', 'j', 'k', 'l'].some((key) => aff[key] !== undefined)
}

/**
 * The same analysis for a 3D affine, from its 3x3 linear part.
 *
 * Layout, as the renderer applies it (`transformAffine3D`):
 *   (a x + b y + c z + d,  e x + f y + g z + h,  i x + j y + k z + l)
 * so the linear part is M = [[a, b, c], [e, f, g], [i, j, k]] and d, h and l
 * translate. An affine with only a..f inside a 3D flame is promoted the way
 * `extractFlameUniforms3D` promotes it: M = [[a, b, 0], [d, e, 0], [0, 0, 1]]
 * (c and f translate, z is left as it is). Reading a 3D affine as the 2D
 * [[a, b], [d, e]] took the x translation d for a matrix entry, so moving a
 * transform changed its stability, HP and Power.
 *
 * - sigma1 = sqrt(largest eigenvalue of M^T M), the spectral norm, as in 2D.
 *   M^T M is symmetric, so its eigenvalues have a closed form (Smith 1961,
 *   "Eigenvalues of a symmetric 3 x 3 matrix").
 * - ratio = |det M|^(1/3), the geometric mean of the three singular values
 *   (their product is |det M|): exactly s for a similarity scaled by s, the
 *   3D counterpart of 2D's sqrt(|det|), clamped the same way.
 * - The Moran equation sum(ratio_i^D) = 1 then gives the similarity
 *   dimension, searched up to 3: 2 for the Sierpinski tetrahedron (four maps
 *   at 1/2), log 20 / log 3 = 2.727 for the Menger sponge (twenty at 1/3).
 * - angle = atan2(e - b, a + f), the rotation of the xy block: the 3D
 *   symmetry transforms (`applySymmetryToFlame`) rotate about z, so this is
 *   the angle whose multiples of 2 pi / k the symmetry detector looks for.
 */
function analyzeLinear3D(aff: AffineRecord): LinearAnalysis {
  const layout3D = isAffine3DLayout(aff)
  const m = layout3D
    ? [
        [aff.a ?? 1, aff.b ?? 0, aff.c ?? 0],
        [aff.e ?? 0, aff.f ?? 1, aff.g ?? 0],
        [aff.i ?? 0, aff.j ?? 0, aff.k ?? 1],
      ]
    : [
        [aff.a ?? 1, aff.b ?? 0, 0],
        [aff.d ?? 0, aff.e ?? 1, 0],
        [0, 0, 1],
      ]
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = m as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ]
  const det =
    m00 * (m11 * m22 - m12 * m21) -
    m01 * (m10 * m22 - m12 * m20) +
    m02 * (m10 * m21 - m11 * m20)
  const sigma1 = Math.sqrt(
    largestEigenvalueOfGram(m00, m01, m02, m10, m11, m12, m20, m21, m22),
  )
  const ratio = Math.max(0.05, Math.min(0.98, Math.cbrt(Math.abs(det))))
  const angle = Math.atan2(m10 - m01, m00 + m11)
  return { sigma1, ratio, angle }
}

/**
 * Largest eigenvalue of A = M^T M for M = [[m00, m01, m02], [m10, m11, m12],
 * [m20, m21, m22]], by the trigonometric solution for a symmetric 3x3.
 */
function largestEigenvalueOfGram(
  m00: number,
  m01: number,
  m02: number,
  m10: number,
  m11: number,
  m12: number,
  m20: number,
  m21: number,
  m22: number,
): number {
  // A = M^T M: column dot products.
  const a00 = m00 * m00 + m10 * m10 + m20 * m20
  const a11 = m01 * m01 + m11 * m11 + m21 * m21
  const a22 = m02 * m02 + m12 * m12 + m22 * m22
  const a01 = m00 * m01 + m10 * m11 + m20 * m21
  const a02 = m00 * m02 + m10 * m12 + m20 * m22
  const a12 = m01 * m02 + m11 * m12 + m21 * m22
  const offDiagonal = a01 * a01 + a02 * a02 + a12 * a12
  if (offDiagonal === 0) return Math.max(0, a00, a11, a22)
  const q = (a00 + a11 + a22) / 3
  const p = Math.sqrt(
    ((a00 - q) ** 2 + (a11 - q) ** 2 + (a22 - q) ** 2 + 2 * offDiagonal) / 6,
  )
  // An off-diagonal too small to square leaves p at 0 (it underflows), and
  // B below would divide by it. A is then q I to the last bit.
  if (!(p > 0)) return Math.max(0, a00, a11, a22)
  // B = (A - q I) / p; its determinant over 2 is cos(3 phi).
  const b00 = (a00 - q) / p
  const b11 = (a11 - q) / p
  const b22 = (a22 - q) / p
  const b01 = a01 / p
  const b02 = a02 / p
  const b12 = a12 / p
  const halfDetB =
    (b00 * (b11 * b22 - b12 * b12) -
      b01 * (b01 * b22 - b12 * b02) +
      b02 * (b01 * b12 - b11 * b02)) /
    2
  const phi = Math.acos(Math.max(-1, Math.min(1, halfDetB))) / 3
  return Math.max(0, q + 2 * p * Math.cos(phi))
}

/**
 * Solve Moran similarity dimension: sum r_i^D = 1
 */
function solveMoranDimension(rValues: number[], spaceDim: number): number {
  if (rValues.length === 0) return 1.0
  if (rValues.length === 1) {
    return Number((rValues[0] ?? 0.5).toFixed(2))
  }

  // Clamped bounds [0.1, spaceDim]
  let low = 0.1
  let high = spaceDim
  for (let iter = 0; iter < 24; iter++) {
    const mid = (low + high) / 2
    let sum = 0
    for (const r of rValues) {
      sum += r ** mid
    }
    if (sum > 1) {
      low = mid
    } else {
      high = mid
    }
  }
  return Number(((low + high) / 2).toFixed(2))
}

/**
 * Detects approximate rotational symmetry order from pre-affine angles.
 */
function detectRotationalSymmetryOrder(
  angles: number[],
  hasSymmetryVars: boolean,
): number {
  if (angles.length < 2) return hasSymmetryVars ? 2 : 1
  const positiveAngles = angles.map((a) => {
    let norm = a % (2 * Math.PI)
    if (norm < 0) norm += 2 * Math.PI
    return norm
  })

  positiveAngles.sort((a, b) => a - b)
  for (const k of [8, 6, 5, 4, 3, 2]) {
    const targetDelta = (2 * Math.PI) / k
    let matches = 0
    for (let i = 0; i < positiveAngles.length - 1; i++) {
      const diff = Math.abs(
        (positiveAngles[i + 1] ?? 0) - (positiveAngles[i] ?? 0) - targetDelta,
      )
      if (diff < 0.18) matches++
    }
    if (matches >= Math.min(2, k - 1)) {
      return k
    }
  }
  return hasSymmetryVars ? 2 : 1
}

/**
 * Calculate grounded, deterministic mathematical stats for a flame.
 */
export function calculateGroundedStats(
  flame: FlameDescriptor,
): GroundedFlameStats {
  const transforms = Object.values(flame.transforms ?? {})
  const spaceDim = flame.renderSettings?.dimensions === 3 ? 3 : 2

  if (transforms.length === 0) {
    return {
      dimension: 1.0,
      stability: 0.8,
      entropy: 0.5,
      nonlinearity: 0.3,
      symmetryOrder: 1,
      beauty: 50,
      school: 'Order',
      hp: 180,
      maxHp: 180,
      atk: 45,
      def: 40,
      critChance: 0.15,
      powerLevel: 500,
    }
  }

  // 1. Structural Singular Values & Contraction
  const spectralNorms: number[] = []
  const rValues: number[] = []
  const angles: number[] = []
  let totalProb = 0
  const probs: number[] = []
  let totalNonlinearWeight = 0
  let totalWeight = 0
  const distinctVariationFamilies = new Set<string>()
  let hasSymmetryVars = false

  for (const t of transforms) {
    if (!t.visible) continue
    const p = Math.max(0.001, t.probability ?? 1)
    totalProb += p
    probs.push(p)

    const aff = (t.preAffine ?? IDENTITY_2D) as AffineRecord
    // 3D flames read their 3x3 linear part; 2D flames exactly as before.
    const { sigma1, ratio, angle } =
      spaceDim === 3 ? analyzeLinear3D(aff) : analyzeLinear2D(aff)
    spectralNorms.push(sigma1)
    angles.push(angle)
    // Contraction ratio r_i
    rValues.push(ratio)

    for (const vData of Object.values(t.variations ?? {})) {
      const w = Math.abs(vData.weight)
      const type = drawnType(vData, spaceDim)
      totalWeight += w
      if (!LINEAR_VARIATIONS.has(type)) {
        totalNonlinearWeight += w
      }
      if (SYMMETRY_VARIATIONS.has(type)) {
        hasSymmetryVars = true
      }
      distinctVariationFamilies.add(type.replace(/Var|3D/g, ''))
    }
  }

  // Moran dimension
  const dimension = solveMoranDimension(rValues, spaceDim)
  // Per space (maff, 2026-09-24): a 3D flame that fills its space scores as
  // a 2D flame that fills the plane, and 2D stays as it was.
  const dimensionPerSpace = (dimension * 2) / spaceDim

  // Stability: 1 - mean spectral norm (clamped 0..1)
  const meanSpectral =
    spectralNorms.length > 0
      ? spectralNorms.reduce((a, b) => a + b, 0) / spectralNorms.length
      : 0.5
  const stability = Number(
    Math.max(
      0.05,
      Math.min(0.98, 1 - Math.min(0.95, meanSpectral * 0.7)),
    ).toFixed(2),
  )

  // Shannon Entropy
  let entropySum = 0
  if (totalProb > 0) {
    for (const p of probs) {
      const q = p / totalProb
      if (q > 0) entropySum -= q * Math.log2(q)
    }
  }
  const maxEntropy = Math.log2(Math.max(1, probs.length))
  const normalizedEntropy =
    maxEntropy > 0 ? Math.min(1, entropySum / maxEntropy) : 0.5
  const entropy = Number(normalizedEntropy.toFixed(2))

  // Nonlinearity
  const nonlinearShare =
    totalWeight > 0 ? totalNonlinearWeight / totalWeight : 0
  const familyBonus = Math.min(0.3, distinctVariationFamilies.size * 0.05)
  const nonlinearity = Number(
    Math.min(1.0, nonlinearShare * 0.7 + familyBonus).toFixed(2),
  )

  // Symmetry Order
  // The fold count of the visible generated set: a dihedral set's mirror is
  // not one more fold.
  const symTransforms = Object.entries(flame.transforms ?? {})
    .filter(([k, t]) => k.startsWith('_sym__') && t.visible)
    .map(([, t]) => t)
  const symmetryOrder =
    symTransforms.length > 0
      ? Math.min(8, detectSymmetryFolds(symTransforms))
      : detectRotationalSymmetryOrder(angles, hasSymmetryVars)

  // Beauty from fitness
  const fitness = evaluateFlameFitness(flame)
  const beauty = Number.isFinite(fitness?.composite)
    ? Math.round(fitness.composite * 100)
    : 50

  // School
  const school = classifySchool(flame)

  // RPG Attributes
  const hp = Math.round(
    COMBAT_COEFFICIENTS.BASE_HP_MULTIPLIER * (1 + stability),
  )
  const atk = Math.round(
    COMBAT_COEFFICIENTS.ATK_GEOMETRIC_WEIGHT *
      (dimensionPerSpace * 10 + nonlinearity * 10) +
      COMBAT_COEFFICIENTS.ATK_BEAUTY_WEIGHT * beauty,
  )
  const symMultiplier = Math.min(
    COMBAT_COEFFICIENTS.MAX_SYMMETRY_BOOST,
    1 + (symmetryOrder - 1) * COMBAT_COEFFICIENTS.SYMMETRY_STEP,
  )
  const def = Math.round(
    stability * symMultiplier * COMBAT_COEFFICIENTS.BASE_DEFENSE_MULTIPLIER,
  )
  const critChance = Number(
    (entropy * COMBAT_COEFFICIENTS.CRIT_CHANCE_FACTOR).toFixed(2),
  )
  const powerLevel = Math.round(
    hp * COMBAT_COEFFICIENTS.POWER_WEIGHTS.HP +
      atk * COMBAT_COEFFICIENTS.POWER_WEIGHTS.ATK +
      def * COMBAT_COEFFICIENTS.POWER_WEIGHTS.DEF +
      beauty * COMBAT_COEFFICIENTS.POWER_WEIGHTS.BEAUTY,
  )

  return {
    dimension,
    stability,
    entropy,
    nonlinearity,
    symmetryOrder,
    beauty,
    school,
    hp,
    maxHp: hp,
    atk,
    def,
    critChance,
    powerLevel,
  }
}

/**
 * Resolves deterministic multi-round combat with battle log.
 */
export function resolveClashCombat(options: {
  nameA: string
  nameB: string
  flameA: FlameDescriptor
  flameB: FlameDescriptor
  stanceA?: TacticalStance
  stanceB?: TacticalStance
  rounds?: number
  seed?: number
  territoryWinner?: 'A' | 'B' | 'draw'
}): ClashCombatResult {
  const {
    nameA,
    nameB,
    flameA,
    flameB,
    stanceA = 'balanced',
    stanceB = 'balanced',
    rounds = 3,
    seed = 4242,
    territoryWinner,
  } = options

  const statsA = calculateGroundedStats(flameA)
  const statsB = calculateGroundedStats(flameB)

  const rng = mulberry32(seed)

  // Stance multipliers
  const stanceModifiers: Record<
    TacticalStance,
    { atk: number; def: number; crit: number }
  > = {
    balanced: { atk: 1.0, def: 1.0, crit: 1.0 },
    resonance: { atk: 1.25, def: 0.95, crit: 1.0 },
    bastion: { atk: 0.9, def: 1.3, crit: 0.85 },
    entropy: { atk: 1.1, def: 0.85, crit: 1.35 },
  }

  const modA = stanceModifiers[stanceA] ?? stanceModifiers.balanced
  const modB = stanceModifiers[stanceB] ?? stanceModifiers.balanced

  const schoolMultA = getSchoolMultiplier(statsA.school, statsB.school)
  const schoolMultB = getSchoolMultiplier(statsB.school, statsA.school)

  let curHpA = statsA.hp
  let curHpB = statsB.hp

  const roundDetails: CombatRoundDetail[] = []
  const battleLog: string[] = []

  battleLog.push(
    `Clash Begins: [${nameA}] (${statsA.school}, Stance: ${stanceA}) vs [${nameB}] (${statsB.school}, Stance: ${stanceB})`,
  )

  if (schoolMultA > 1.0) {
    battleLog.push(
      `Advantage: ${statsA.school} holds dominance over ${statsB.school} (x${schoolMultA.toFixed(2)} damage).`,
    )
  } else if (schoolMultB > 1.0) {
    battleLog.push(
      `Advantage: ${statsB.school} holds dominance over ${statsA.school} (x${schoolMultB.toFixed(2)} damage).`,
    )
  }

  let winsA = 0
  let winsB = 0

  for (let r = 1; r <= rounds; r++) {
    // Attack calculation
    const rollCritA = rng() < statsA.critChance * modA.crit
    const rollCritB = rng() < statsB.critChance * modB.crit

    const critMultA = rollCritA ? 1.5 : 1.0
    const critMultB = rollCritB ? 1.5 : 1.0

    // Base damage = ATK * schoolMult * critMult - (DEF * 0.4)
    const rawDmgA =
      statsA.atk * modA.atk * schoolMultA * critMultA -
      statsB.def * modB.def * 0.4
    const rawDmgB =
      statsB.atk * modB.atk * schoolMultB * critMultB -
      statsA.def * modA.def * 0.4

    // Fluctuation: +/- 15%
    const flucA = 0.85 + rng() * 0.3
    const flucB = 0.85 + rng() * 0.3

    const dmgA = Math.max(12, Math.round(rawDmgA * flucA))
    const dmgB = Math.max(12, Math.round(rawDmgB * flucB))

    curHpA = Math.max(0, curHpA - dmgB)
    curHpB = Math.max(0, curHpB - dmgA)

    const roundWinner = dmgA > dmgB ? 'A' : dmgB > dmgA ? 'B' : 'draw'
    if (roundWinner === 'A') winsA++
    else if (roundWinner === 'B') winsB++

    const critTagA = rollCritA ? ' [CRIT!]' : ''
    const critTagB = rollCritB ? ' [CRIT!]' : ''

    const logEntry = `Round ${r}: ${nameA} deals ${dmgA}${critTagA} dmg; ${nameB} deals ${dmgB}${critTagB} dmg. Remaining HP: ${curHpA} vs ${curHpB}.`
    battleLog.push(logEntry)

    roundDetails.push({
      round: r,
      dmgA,
      dmgB,
      isCritA: rollCritA,
      isCritB: rollCritB,
      hpAfterA: curHpA,
      hpAfterB: curHpB,
      roundWinner,
      log: logEntry,
    })
  }

  // Determine overall winner (honoring territoryWinner if provided)
  let winner: 'A' | 'B' | 'draw'
  if (territoryWinner) {
    winner = territoryWinner
  } else if (curHpA > curHpB) winner = 'A'
  else if (curHpB > curHpA) winner = 'B'
  else if (winsA > winsB) winner = 'A'
  else if (winsB > winsA) winner = 'B'
  else if (statsA.beauty > statsB.beauty) winner = 'A'
  else if (statsB.beauty > statsA.beauty) winner = 'B'
  else winner = 'draw'

  const winnerName =
    winner === 'A' ? nameA : winner === 'B' ? nameB : 'Neither fighter'
  battleLog.push(
    `Verdict: ${winnerName} claims victory! Final Score: ${winsA} - ${winsB} (Remaining HP: ${curHpA} vs ${curHpB}).`,
  )

  return {
    winner,
    rounds: roundDetails,
    finalHp: { A: curHpA, B: curHpB },
    finalScore: { A: winsA, B: winsB },
    battleLog,
    schoolA: statsA.school,
    schoolB: statsB.school,
    schoolMultiplierA: schoolMultA,
    schoolMultiplierB: schoolMultB,
  }
}
