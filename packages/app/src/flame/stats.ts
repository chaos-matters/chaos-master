/**
 * Grounded flame stats and deterministic combat resolution for Arena Mode.
 *
 * Implements structural property analysis (Moran dimension, spectral stability,
 * Shannon entropy, nonlinearity, rotational symmetry detection) and deterministic
 * combat resolution with school advantages and tactical stances.
 */

import { scoreFlame as evaluateFlameFitness } from './fitness'
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

const LINEAR_VARIATIONS = new Set([
  'linearVar',
  'linearTVar',
  'linear3D',
  'linear',
])

const SYMMETRY_VARIATIONS = new Set([
  'juliaVar',
  'juliaNVar',
  'juliaScopeVar',
  'kaleidoscopeVar',
  'ngonVar',
  'archVar',
  'cylinderVar',
  'cylinder2Var',
  'cylinderApoVar',
  'polarVar',
  'polar2Var',
  'nPolarVar',
  'symBandG1Var',
  'symBandG2Var',
  'symBandG3Var',
  'symBandG4Var',
  'symBandG5Var',
  'symBandG6Var',
  'symBandG7Var',
  'symNetG1Var',
  'symNetG2Var',
  'symNetG3Var',
  'symNetG4Var',
  'symNetG5Var',
  'symNetG6Var',
  'symNetG7Var',
  'symNetG8Var',
  'symNetG9Var',
  'symNetG10Var',
  'symNetG11Var',
  'symNetG12Var',
  'symNetG13Var',
  'symNetG14Var',
  'symNetG15Var',
  'symNetG16Var',
  'symNetG17Var',
  'postMirrorWfVar',
  'postAxisSymmetryWfVar',
  'postPointSymmetryWfVar',
  'julia3D',
  'polar3D',
  'cylinder3D',
  'cylindrical3D',
  'spherical3D',
  'sphere3D',
  'hemisphere3D',
])

const VORTEX_VARIATIONS = new Set([
  'swirlVar',
  'spiralVar',
  'curlVar',
  'swirl3D',
  'spiral3D',
  'curl3D',
  'vortexVar',
])

const VOID_VARIATIONS = new Set([
  'sphericalVar',
  'bubbleVar',
  'eyefishVar',
  'inversionVar',
  'hyperbolicVar',
  'popcornVar',
  'blackHoleVar',
  'spherical3D',
  'sphere3D',
])

const TIDE_VARIATIONS = new Set([
  'sinusoidalVar',
  'wavesVar',
  'blurVar',
  'gaussianBlurVar',
  'radialBlurVar',
  'rippleVar',
  'tideVar',
  'sinusoidal3D',
])

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

  for (const t of transforms) {
    const customVars = (t as { customVariations?: Record<string, unknown> })
      .customVariations
    if (customVars && Object.keys(customVars).length > 0) {
      arcaneWeight += 3.0
    }
    for (const [vName, vData] of Object.entries(t.variations ?? {})) {
      const w = Math.abs(vData.weight)
      if (LINEAR_VARIATIONS.has(vName)) orderWeight += w
      else if (SYMMETRY_VARIATIONS.has(vName)) crystalWeight += w
      else if (VORTEX_VARIATIONS.has(vName)) vortexWeight += w
      else if (VOID_VARIATIONS.has(vName)) voidWeight += w
      else if (TIDE_VARIATIONS.has(vName)) tideWeight += w
      else if (vName.startsWith('custom_') || vName.includes('custom'))
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

    const aff = t.preAffine ?? { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
    const { sigma1, det, angle } = analyze2x2Affine(
      aff.a ?? 1,
      aff.b ?? 0,
      aff.d ?? 0,
      aff.e ?? 1,
    )
    spectralNorms.push(sigma1)
    angles.push(angle)

    // Contraction ratio r_i
    const r = Math.max(
      0.05,
      Math.min(0.98, Math.sqrt(Math.max(0.001, Math.abs(det)))),
    )
    rValues.push(r)

    for (const [vName, vData] of Object.entries(t.variations ?? {})) {
      const w = Math.abs(vData.weight)
      totalWeight += w
      if (!LINEAR_VARIATIONS.has(vName)) {
        totalNonlinearWeight += w
      }
      if (SYMMETRY_VARIATIONS.has(vName)) {
        hasSymmetryVars = true
      }
      distinctVariationFamilies.add(vName.replace(/Var|3D/g, ''))
    }
  }

  // Moran dimension
  const dimension = solveMoranDimension(rValues, spaceDim)

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
  const symTransformCount = Object.entries(flame.transforms ?? {}).filter(
    ([k, t]) => k.startsWith('_sym__') && t.visible,
  ).length
  const symmetryOrder =
    symTransformCount > 0
      ? Math.min(8, symTransformCount + 1)
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
      (dimension * 10 + nonlinearity * 10) +
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
