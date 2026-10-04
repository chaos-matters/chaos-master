/**
 * Bilinear approximation (BLA): a table of shortcuts through a reference orbit.
 *
 * While a pixel's delta is small, `d <- 2 Z d + d^2 + dc` is almost linear in
 * `d` and `dc`, so `l` iterations collapse into one affine map
 * `d_{m+l} = A d_m + B dc`, valid while `|d_m| < R` (Zhuoran 2021,
 * Heiland-Allen 2022). Level `j` of the table holds maps that skip `2^j`
 * iterations, built by merging neighbouring pairs of level `j - 1`:
 *
 *   A = A_y A_x,  B = A_y B_x + B_y,
 *   R = max(0, min(R_x, (R_y - |B_x| |dc|max) / |A_x|))
 *
 * with single steps `A = 2 Z_m`, `B = 1` (0 for a Julia set) and
 * `R = max(0, eps |A| - |B| |dc|max / |A|)`. `A` and `B` outgrow every float
 * format at depth, so they are floatexp; `R` is kept as log2, where the two
 * subtractions above are exact enough and nothing overflows.
 *
 * The table is written straight into the GPU layout (32 bytes per entry) and
 * read back from those bytes by the CPU mirror, so what is tested is what the
 * shader sees.
 */
import { exponentOf, scalePow2, ZERO_EXPONENT } from './floatExp'
import type { ReferenceOrbit } from './referenceOrbit'

export const BLA_ENTRY_BYTES = 32
export const BLA_ENTRY_WORDS = BLA_ENTRY_BYTES / 4

/** Radius stored for "never valid": below any delta a pixel can have. */
export const BLA_INVALID_LOG2 = -3.0e38

/** f32 precision: how much of the dropped `d^2` term the table tolerates. */
export const BLA_EPSILON_LOG2 = -24

/**
 * log2 slack taken off every stored radius. The shader compares in f32, whose
 * rounding of a log2 near 1e4 is about 1e-3; this keeps rounding on the safe
 * side of the heuristic instead of the wrong one.
 */
const RADIUS_MARGIN_LOG2 = 0.05

/**
 * Levels below this are built (every level merges the one beneath it) but
 * not stored. A 1- or 2-step shortcut saves nothing over a perturbation step,
 * and dropping them cuts the table from 32 to 8 bytes per iteration, which is
 * what keeps a two-million-iteration orbit inside one GPU binding.
 */
export const BLA_MIN_LEVEL = 3

export interface BlaLevel {
  /** First entry of this level in the packed table. */
  readonly offset: number
  readonly count: number
  /** Iterations each entry of this level skips: `2^level`. */
  readonly steps: number
}

export interface BlaTable {
  readonly data: ArrayBuffer
  /** Stored levels, `minLevel` first: `levels[i]` skips `2^(minLevel + i)`. */
  readonly levels: readonly BlaLevel[]
  readonly minLevel: number
  /** Reference index of the first entry of every level. */
  readonly start: number
  readonly entryCount: number
  /** log2 of the largest pixel offset the radii were computed for. */
  readonly cMaxLog2: number
}

export interface BlaOptions {
  /** True for the Mandelbrot set, whose recurrence carries `+ dc`. */
  readonly hasDc: boolean
  /** First reference index to cover: 1 when Z_0 is the critical point 0. */
  readonly start: number
  /** log2 of max |dc| over every pixel that will use the table. */
  readonly cMaxLog2: number
  readonly maxLevels?: number
  /** Defaults to `BLA_MIN_LEVEL`. */
  readonly minLevel?: number
}

/** `log2(2^a - 2^b)`, or -Infinity when that is not positive. */
function log2Difference(a: number, b: number): number {
  if (!(a > b)) return Number.NEGATIVE_INFINITY
  if (b === Number.NEGATIVE_INFINITY) return a
  return a + Math.log2(1 - 2 ** (b - a))
}

interface Level {
  aRe: Float64Array
  aIm: Float64Array
  aE: Float64Array
  bRe: Float64Array
  bIm: Float64Array
  bE: Float64Array
  logR: Float64Array
  count: number
}

function allocateLevel(count: number): Level {
  return {
    aRe: new Float64Array(count),
    aIm: new Float64Array(count),
    aE: new Float64Array(count),
    bRe: new Float64Array(count),
    bIm: new Float64Array(count),
    bE: new Float64Array(count),
    logR: new Float64Array(count),
    count,
  }
}

/** Normalise a complex mantissa into `level[k]`, slot `a` or `b`. */
function store(
  level: Level,
  slot: 'a' | 'b',
  k: number,
  re: number,
  im: number,
  e: number,
): void {
  const big = Math.max(Math.abs(re), Math.abs(im))
  const [reArr, imArr, eArr] =
    slot === 'a'
      ? [level.aRe, level.aIm, level.aE]
      : [level.bRe, level.bIm, level.bE]
  if (big === 0 || !Number.isFinite(big)) {
    reArr[k] = 0
    imArr[k] = 0
    eArr[k] = ZERO_EXPONENT
    return
  }
  const shift = exponentOf(big)
  reArr[k] = scalePow2(re, -shift)
  imArr[k] = scalePow2(im, -shift)
  eArr[k] = e + shift
}

function log2Abs(re: number, im: number, e: number): number {
  const h = Math.hypot(re, im)
  return h === 0 ? Number.NEGATIVE_INFINITY : e + Math.log2(h)
}

function singleSteps(orbit: ReferenceOrbit, options: BlaOptions): Level {
  const count = Math.max(0, orbit.length - 1 - options.start)
  const level = allocateLevel(count)
  const eps = BLA_EPSILON_LOG2
  for (let k = 0; k < count; k += 1) {
    const m = options.start + k
    const zE = orbit.zExp[m]!
    // A = 2 Z_m
    store(level, 'a', k, orbit.z[2 * m]!, orbit.z[2 * m + 1]!, zE + 1)
    if (options.hasDc) store(level, 'b', k, 1, 0, 0)
    else store(level, 'b', k, 0, 0, 0)
    const la = log2Abs(level.aRe[k]!, level.aIm[k]!, level.aE[k]!)
    level.logR[k] = options.hasDc
      ? log2Difference(eps + la, options.cMaxLog2 - la)
      : eps + la
  }
  return level
}

/** `min(R_x, reach / |A_x|)` in log2; a zero `A_x` never validates anything. */
function mergedRadius(logRx: number, logReach: number, logAx: number): number {
  if (logAx === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY
  return Math.min(logRx, logReach - logAx)
}

function mergeLevel(below: Level, options: BlaOptions): Level {
  const count = Math.floor(below.count / 2)
  const level = allocateLevel(count)
  for (let k = 0; k < count; k += 1) {
    const x = 2 * k
    const y = x + 1
    const axr = below.aRe[x]!
    const axi = below.aIm[x]!
    const axe = below.aE[x]!
    const ayr = below.aRe[y]!
    const ayi = below.aIm[y]!
    const aye = below.aE[y]!
    // A = A_y A_x
    store(
      level,
      'a',
      k,
      ayr * axr - ayi * axi,
      ayr * axi + ayi * axr,
      aye + axe,
    )
    const logAx = log2Abs(axr, axi, axe)
    if (options.hasDc) {
      // B = A_y B_x + B_y, aligned to the larger exponent before adding.
      const bxr = below.bRe[x]!
      const bxi = below.bIm[x]!
      const bxe = below.bE[x]!
      const pRe = ayr * bxr - ayi * bxi
      const pIm = ayr * bxi + ayi * bxr
      const pE = aye + bxe
      const byE = below.bE[y]!
      const e = Math.max(pE, byE)
      store(
        level,
        'b',
        k,
        scalePow2(pRe, pE - e) + scalePow2(below.bRe[y]!, byE - e),
        scalePow2(pIm, pE - e) + scalePow2(below.bIm[y]!, byE - e),
        e,
      )
      const logBx = log2Abs(bxr, bxi, bxe)
      const reach = log2Difference(below.logR[y]!, logBx + options.cMaxLog2)
      level.logR[k] = mergedRadius(below.logR[x]!, reach, logAx)
    } else {
      store(level, 'b', k, 0, 0, 0)
      level.logR[k] = mergedRadius(below.logR[x]!, below.logR[y]!, logAx)
    }
  }
  return level
}

/** Build every level and pack them, level 0 first, into the GPU layout. */
export function buildBla(orbit: ReferenceOrbit, options: BlaOptions): BlaTable {
  const maxLevels = options.maxLevels ?? 32
  const minLevel = options.minLevel ?? BLA_MIN_LEVEL
  const built: Level[] = []
  let level = singleSteps(orbit, options)
  for (let j = 0; level.count > 0 && j < maxLevels; j += 1) {
    if (j >= minLevel) built.push(level)
    level = mergeLevel(level, options)
  }
  const entryCount = built.reduce((sum, l) => sum + l.count, 0)
  const data = new ArrayBuffer(Math.max(1, entryCount) * BLA_ENTRY_BYTES)
  const f32 = new Float32Array(data)
  const i32 = new Int32Array(data)
  const u32 = new Uint32Array(data)
  const levels: BlaLevel[] = []
  let offset = 0
  built.forEach((l, i) => {
    const j = minLevel + i
    levels.push({ offset, count: l.count, steps: 2 ** j })
    for (let k = 0; k < l.count; k += 1) {
      const w = (offset + k) * BLA_ENTRY_WORDS
      f32[w] = l.aRe[k]!
      f32[w + 1] = l.aIm[k]!
      f32[w + 2] = l.bRe[k]!
      f32[w + 3] = l.bIm[k]!
      i32[w + 4] = clampExponent(l.aE[k]!)
      i32[w + 5] = clampExponent(l.bE[k]!)
      const logR = l.logR[k]!
      f32[w + 6] = Number.isFinite(logR)
        ? logR - RADIUS_MARGIN_LOG2
        : BLA_INVALID_LOG2
      u32[w + 7] = 2 ** j
    }
    offset += l.count
  })
  return {
    data,
    levels,
    minLevel,
    start: options.start,
    entryCount,
    cMaxLog2: options.cMaxLog2,
  }
}

function clampExponent(e: number): number {
  return Math.max(ZERO_EXPONENT, Math.min(0x3fffffff, e))
}

/** One packed entry, decoded. For the CPU mirror and for tests. */
export interface BlaEntry {
  aRe: number
  aIm: number
  bRe: number
  bIm: number
  aE: number
  bE: number
  logR: number
  steps: number
}

export function readBlaEntry(table: BlaTable, index: number): BlaEntry {
  const f32 = new Float32Array(table.data)
  const i32 = new Int32Array(table.data)
  const u32 = new Uint32Array(table.data)
  const w = index * BLA_ENTRY_WORDS
  return {
    aRe: f32[w]!,
    aIm: f32[w + 1]!,
    bRe: f32[w + 2]!,
    bIm: f32[w + 3]!,
    aE: i32[w + 4]!,
    bE: i32[w + 5]!,
    logR: f32[w + 6]!,
    steps: u32[w + 7]!,
  }
}
