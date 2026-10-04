/**
 * The per-pixel kernel of the explorer, on the CPU, in emulated f32.
 *
 * This is the specification of the WGSL in the app's `explorerShaders.ts`,
 * written where it can be tested: every f32 operation is rounded with
 * `Math.fround`, and `ldexp` flushes below 2^-126 to zero, because WGSL lets
 * an implementation do exactly that. Change one, change the other.
 *
 * The delta is kept rescaled, `d = w * 2^e` (Heiland-Allen): with `e = 0` a
 * step is plain f32 perturbation, and `e` only moves when `|w|` leaves
 * [2^-20, 2^20], so shallow views pay nothing and deep ones never underflow.
 * Where the reference passes within 2^-60 of zero its value no longer fits
 * f32 either, and that one step is done in full floatexp. Every comparison is
 * made in the delta's own scale; squared absolute magnitudes underflow at
 * 1e-19 and are never formed.
 */
import { BLA_ENTRY_WORDS } from './bla'
import { exponentOf } from './floatExp'
import { ORBIT_ENTRY_WORDS } from './gpuPacking'
import type { BlaTable } from './bla'

export const STATUS_ITERATING = 0
export const STATUS_ESCAPED = 1
export const STATUS_INTERIOR = 2

export const BAILOUT = 256
const BAILOUT2 = BAILOUT * BAILOUT
const LOG2_LN_BAILOUT = Math.log2(Math.log(BAILOUT))

/** `|w|` outside [2^-20, 2^20] moves the exponent. */
const RESCALE_EXP = 20
/** A reference value below 2^-60 gets a full floatexp step. */
const TINY_Z_EXP = -60
/** A reference more than 2^40 times the delta simply is the pixel value. */
const FAR_EXP = 40
/** With `e` at or below this the pixel cannot be near the bailout. */
const NO_ESCAPE_EXP = -33
/** `dc` stays within 2^60 of the delta's scale, so `dc / 2^e` fits f32. */
const DC_HEADROOM_EXP = 60
/**
 * Lowest exponent a delta or derivative may have. A pixel falling into a
 * superattracting cycle squares its delta every period, so its exponent
 * doubles and would overflow the shader's i32 within a few dozen periods;
 * anything this small is zero at every precision the reference has.
 */
export const EXPONENT_FLOOR = -(2 ** 24)
const I32_LIMIT = 2 ** 31
const MIN_NORMAL = 2 ** -126

const fr = Math.fround

type V2 = [number, number]

export interface KernelOrbit {
  /** Packed reference entries (see `gpuPacking.ts`). */
  readonly data: ArrayBuffer
  readonly length: number
  readonly bla?: BlaTable
}

export interface KernelParams {
  /** The Mandelbrot recurrence carries `+ dc`; a Julia set's does not. */
  readonly hasDc: boolean
  /** Pixel spacing as `spacingMant * 2^spacingExp`. */
  readonly spacingMant: number
  readonly spacingExp: number
  readonly maxIterations: number
  readonly useBla: boolean
  readonly wantDerivative: boolean
  /** Orbit 0 starts every pixel; a rebase moves it to orbit 1 for good. */
  readonly orbits: readonly [KernelOrbit, KernelOrbit]
}

export interface PixelState {
  w: V2
  e: number
  dm: V2
  de: number
  m: number
  orbit: 0 | 1
  n: number
  status: number
  /** Filled on escape: smooth iteration count, log2 of the DE in pixels. */
  nu: number
  log2De: number
  normal: V2
}

/**
 * `x * 2^k`, as the shader does it: WGSL's own `ldexp` is indeterminate for
 * `k > 128` and may flush for `k < -126`, so the shader multiplies by a
 * power of two it builds itself and returns 0 below 2^-126. Every value the
 * kernel scales that far down is negligible next to what it is added to.
 */
function ldexp(x: number, k: number): number {
  if (x === 0 || k < -126) return 0
  const r = fr(x * 2 ** Math.min(k, 127))
  return Math.abs(r) < MIN_NORMAL ? 0 : r
}

function ldexp2(v: V2, k: number): V2 {
  return [ldexp(v[0], k), ldexp(v[1], k)]
}

function cmul(a: V2, b: V2): V2 {
  return [
    fr(fr(a[0] * b[0]) - fr(a[1] * b[1])),
    fr(fr(a[0] * b[1]) + fr(a[1] * b[0])),
  ]
}

function add(a: V2, b: V2): V2 {
  return [fr(a[0] + b[0]), fr(a[1] + b[1])]
}

function scale(a: V2, s: number): V2 {
  return [fr(a[0] * s), fr(a[1] * s)]
}

function dot(a: V2): number {
  return fr(fr(a[0] * a[0]) + fr(a[1] * a[1]))
}

function maxAbs(v: V2): number {
  return Math.max(Math.abs(v[0]), Math.abs(v[1]))
}

interface Term {
  m: V2
  e: number
}

/** Sum floatexp terms, aligned to the largest; zero terms are skipped. */
function feSum(terms: readonly Term[], fallbackE: number): Term {
  let top = Number.NEGATIVE_INFINITY
  for (const t of terms) {
    const a = maxAbs(t.m)
    if (a >= MIN_NORMAL) top = Math.max(top, t.e + exponentOf(a))
  }
  if (top === Number.NEGATIVE_INFINITY) return { m: [0, 0], e: fallbackE }
  let sum: V2 = [0, 0]
  for (const t of terms) {
    if (maxAbs(t.m) >= MIN_NORMAL) sum = add(sum, ldexp2(t.m, t.e - top))
  }
  return { m: sum, e: top }
}

interface Views {
  f32: Float32Array
  i32: Int32Array
  u32: Uint32Array
}

const viewCache = new WeakMap<ArrayBuffer, Views>()

function views(data: ArrayBuffer): Views {
  let v = viewCache.get(data)
  if (!v) {
    v = {
      f32: new Float32Array(data),
      i32: new Int32Array(data),
      u32: new Uint32Array(data),
    }
    viewCache.set(data, v)
  }
  return v
}

function orbitEntry(orbit: KernelOrbit, m: number): { zm: V2; ze: number } {
  const { f32, i32 } = views(orbit.data)
  const w = m * ORBIT_ENTRY_WORDS
  return { zm: [f32[w]!, f32[w + 1]!], ze: i32[w + 2]! }
}

/** Keep `|w|` in range and `dc / 2^e` representable. */
function rescale(px: PixelState, p: KernelParams): void {
  const a = maxAbs(px.w)
  if (a < MIN_NORMAL) {
    px.w = [0, 0]
  } else if (a > 2 ** RESCALE_EXP || a < 2 ** -RESCALE_EXP) {
    const k = exponentOf(a)
    px.w = ldexp2(px.w, -k)
    px.e += k
  }
  const floor = p.hasDc ? p.spacingExp - DC_HEADROOM_EXP : EXPONENT_FLOOR
  if (px.e < floor) {
    px.w = ldexp2(px.w, px.e - floor)
    px.e = floor
  }
}

/** The derivative has no dc to stay near; it only needs the i32 floor. */
function floorDerivative(px: PixelState): void {
  if (px.de < EXPONENT_FLOOR) {
    px.dm = [0, 0]
    px.de = EXPONENT_FLOOR
  }
}

export function initPixel(p: KernelParams, dcm: V2): PixelState {
  const px: PixelState = {
    w: p.hasDc ? [0, 0] : [fr(dcm[0]), fr(dcm[1])],
    e: p.spacingExp,
    dm: p.hasDc ? [0, 0] : [fr(p.spacingMant), 0],
    de: p.spacingExp,
    m: 0,
    orbit: 0,
    n: 0,
    status: STATUS_ITERATING,
    nu: 0,
    log2De: 0,
    normal: [0, 0],
  }
  rescale(px, p)
  rebaseAtStart(px, p)
  return px
}

/**
 * A reference that escapes at its first entry (a Julia view centred outside
 * the bailout radius) leaves nothing to step along: such a pixel starts
 * rebased onto `orbits[1]`, as `testPixel` would rebase it at m = 0.
 */
function rebaseAtStart(px: PixelState, p: KernelParams): void {
  if (p.orbits[0].length > 1) return
  const { zm, ze } = orbitEntry(p.orbits[0], 0)
  const diff = ze - px.e
  if (diff > FAR_EXP) {
    px.w = add(zm, ldexp2(px.w, -diff))
    px.e = ze
  } else {
    px.w = add(ldexp2(zm, diff), px.w)
  }
  px.orbit = 1
  rescale(px, p)
}

/** The pixel value `z = Z_m + d` as floatexp, for the derivative. */
function pixelValue(px: PixelState, zm: V2, ze: number): Term {
  const diff = ze - px.e
  if (diff > FAR_EXP) return { m: zm, e: ze }
  return { m: add(ldexp2(zm, diff), px.w), e: px.e }
}

function stepDerivative(
  px: PixelState,
  p: KernelParams,
  zm: V2,
  ze: number,
): void {
  const z = pixelValue(px, zm, ze)
  const terms: Term[] = [{ m: scale(cmul(z.m, px.dm), 2), e: z.e + px.de }]
  if (p.hasDc) terms.push({ m: [fr(p.spacingMant), 0], e: p.spacingExp })
  const next = feSum(terms, px.de)
  px.dm = next.m
  px.de = next.e
  floorDerivative(px)
}

function perturbStep(
  px: PixelState,
  p: KernelParams,
  orbit: KernelOrbit,
  dcm: V2,
): void {
  const { zm, ze } = orbitEntry(orbit, px.m)
  if (p.wantDerivative) stepDerivative(px, p, zm, ze)
  if (ze >= TINY_Z_EXP) {
    const zf = ldexp2(zm, ze)
    const d = p.hasDc ? ldexp2(dcm, p.spacingExp - px.e) : ([0, 0] as V2)
    px.w = add(add(scale(cmul(zf, px.w), 2), ldexp2(cmul(px.w, px.w), px.e)), d)
  } else {
    const terms: Term[] = [
      { m: scale(cmul(zm, px.w), 2), e: ze + px.e },
      { m: cmul(px.w, px.w), e: 2 * px.e },
    ]
    if (p.hasDc) terms.push({ m: dcm, e: p.spacingExp })
    const next = feSum(terms, px.e)
    px.w = next.m
    px.e = next.e
  }
  px.m += 1
  px.n += 1
}

function countTrailingZeros(x: number): number {
  return x === 0 ? 32 : 31 - Math.clz32(x & -x)
}

function tryBla(
  px: PixelState,
  p: KernelParams,
  orbit: KernelOrbit,
  dcm: V2,
): boolean {
  const table = orbit.bla
  if (!p.useBla || !table || px.m < table.start || table.levels.length === 0)
    return false
  const rel = px.m - table.start
  const top = Math.min(
    countTrailingZeros(rel),
    table.minLevel + table.levels.length - 1,
  )
  if (top < table.minLevel) return false
  // A zero delta is the reference itself: stepping it is exact and cheap.
  const wLen = fr(Math.hypot(px.w[0], px.w[1]))
  if (wLen === 0) return false
  const logD = fr(px.e + fr(Math.log2(wLen)))
  for (let j = top; j >= table.minLevel; j -= 1) {
    const level = table.levels[j - table.minLevel]!
    const index = rel >>> j
    if (index >= level.count) continue
    const { f32, i32, u32 } = views(table.data)
    const w = (level.offset + index) * BLA_ENTRY_WORDS
    const steps = u32[w + 7]!
    if (!(logD < f32[w + 6]!) || px.n + steps > p.maxIterations) continue
    const a: V2 = [f32[w]!, f32[w + 1]!]
    const b: V2 = [f32[w + 2]!, f32[w + 3]!]
    const aE = i32[w + 4]!
    const bE = i32[w + 5]!
    const terms: Term[] = [{ m: cmul(a, px.w), e: aE + px.e }]
    if (p.hasDc) terms.push({ m: cmul(b, dcm), e: bE + p.spacingExp })
    const next = feSum(terms, px.e)
    if (p.wantDerivative) {
      const dTerms: Term[] = [{ m: cmul(a, px.dm), e: aE + px.de }]
      if (p.hasDc)
        dTerms.push({ m: scale(b, p.spacingMant), e: bE + p.spacingExp })
      const nd = feSum(dTerms, px.de)
      px.dm = nd.m
      px.de = nd.e
      floorDerivative(px)
    }
    px.w = next.m
    px.e = next.e
    px.m += steps
    px.n += steps
    return true
  }
  return false
}

function finish(px: PixelState, p: KernelParams, z: V2): void {
  const r2 = dot(z)
  const lnAbs = fr(0.5 * Math.log(r2))
  px.nu = fr(px.n - fr(Math.log2(lnAbs) - LOG2_LN_BAILOUT))
  if (p.wantDerivative) {
    const dLen = Math.hypot(px.dm[0], px.dm[1])
    const logD = px.de + Math.log2(dLen)
    px.log2De = fr(Math.log2(2 * Math.sqrt(r2) * lnAbs) - logD)
    const u = cmul(z, [px.dm[0], -px.dm[1]])
    const len = Math.hypot(u[0], u[1]) || 1
    px.normal = [fr(u[0] / len), fr(u[1] / len)]
  }
  px.status = STATUS_ESCAPED
}

/** Escape and rebase tests at the pixel's current reference index. */
function testPixel(px: PixelState, p: KernelParams, orbit: KernelOrbit): void {
  const { zm, ze } = orbitEntry(orbit, px.m)
  const diff = ze - px.e
  const far = diff > FAR_EXP
  let zAbs: V2 | undefined
  let rebase = false
  let zs: V2 = zm
  if (far) {
    zAbs = ldexp2(zm, ze)
  } else {
    zs = add(ldexp2(zm, diff), px.w)
    rebase = dot(zs) < dot(px.w)
    if (px.e > NO_ESCAPE_EXP) zAbs = ldexp2(zs, px.e)
  }
  if (zAbs && dot(zAbs) > BAILOUT2) {
    finish(px, p, zAbs)
    return
  }
  if (!rebase && px.m < orbit.length - 1) return
  if (far) {
    px.w = add(zm, ldexp2(px.w, -diff))
    px.e = ze
  } else {
    px.w = zs
  }
  px.m = 0
  px.orbit = 1
  rescale(px, p)
}

/** Advance one pixel by at most `budget` steps (a BLA skip is one step). */
export function iteratePixel(
  px: PixelState,
  p: KernelParams,
  dcm: V2,
  budget: number,
): void {
  for (let k = 0; k < budget && px.status === STATUS_ITERATING; k += 1) {
    if (px.n >= p.maxIterations) {
      px.status = STATUS_INTERIOR
      return
    }
    const orbit = p.orbits[px.orbit]
    if (!tryBla(px, p, orbit, dcm)) perturbStep(px, p, orbit, dcm)
    rescale(px, p)
    testPixel(px, p, orbit)
    // The shader holds both exponents in i32; the mirror must never need more.
    if (!(Math.abs(px.e) < I32_LIMIT && Math.abs(px.de) < I32_LIMIT)) {
      throw new RangeError(
        `exponent outside i32 at n=${px.n}: e=${px.e}, de=${px.de}`,
      )
    }
  }
}

/** Run one pixel to completion. `dcm` is its offset in units of `2^spacingExp`. */
export function renderPixel(p: KernelParams, dcm: V2): PixelState {
  const px = initPixel(p, dcm)
  iteratePixel(px, p, dcm, Number.POSITIVE_INFINITY)
  return px
}
