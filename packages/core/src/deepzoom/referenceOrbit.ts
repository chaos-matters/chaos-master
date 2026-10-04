/**
 * The reference orbit: one point iterated at full precision so that every
 * pixel near it can be iterated as a tiny, low-precision difference.
 *
 * This is the half of perturbation rendering that cannot run on the GPU. A
 * GPU has 24 mantissa bits; a view at 1e100 needs 330 just to tell two
 * pixels apart. So one orbit is computed here on BigInt fixed point, and the
 * GPU iterates each pixel's offset from it (see `perturbation.ts`). The
 * stored values are rounded to doubles — rounding a correct value is
 * harmless, and it is only the *iteration* that has to be exact.
 *
 * The iteration is a generator so a worker can run it in slices and drop it
 * the moment the view moves on, instead of finishing an orbit nobody needs.
 */
import { fixedToScaledNumber, parseFixed } from './bigFixed'

export type FractalKind = 'mandelbrot' | 'julia'

export interface OrbitSpec {
  /** Starting value Z_0. 0 for the Mandelbrot set and for a critical orbit. */
  readonly startRe: string
  readonly startIm: string
  /** The additive constant c. */
  readonly cRe: string
  readonly cIm: string
  /** Fixed-point fraction bits. */
  readonly bits: number
  readonly maxIterations: number
  /** The orbit ends at the first value with |Z| above this. */
  readonly escapeRadius: number
}

export interface ReferenceOrbit {
  /**
   * Z_0 .. Z_{length-1}, interleaved re, im, each pair scaled by
   * `2^zExp[n]`. The exponent is 0 unless the value is too small for a
   * double — the orbit of a minibrot nucleus passes arbitrarily close to 0.
   */
  readonly z: Float64Array
  readonly zExp: Int32Array
  readonly length: number
  /** True when the last stored value is the first one past the radius. */
  readonly escaped: boolean
}

/** Iterations between yields. Small enough to cancel within a few ms. */
export const ORBIT_SLICE = 4096

/** Below this magnitude a double would start losing mantissa bits. */
const DOUBLE_SAFE = 2n ** 53n

/**
 * Round one fixed-point pair to doubles with a shared power of two. The fast
 * path keeps the top 64 bits; only values below 2^-11 take the exact path,
 * which is what keeps a value of 1e-400 from reading as zero.
 */
function toScaledPair(
  x: bigint,
  y: bigint,
  bits: number,
  shift: bigint,
  scale: number,
): { re: number; im: number; exp: number } {
  const tx = x >> shift
  const ty = y >> shift
  const big = (t: bigint) => t >= DOUBLE_SAFE || t <= -DOUBLE_SAFE
  if (shift === 0n || big(tx) || big(ty)) {
    return { re: Number(tx) * scale, im: Number(ty) * scale, exp: 0 }
  }
  const sx = fixedToScaledNumber(x, bits)
  const sy = fixedToScaledNumber(y, bits)
  const exp = Math.max(
    x === 0n ? -Infinity : sx.exponent,
    y === 0n ? -Infinity : sy.exponent,
  )
  if (exp === -Infinity) return { re: 0, im: 0, exp: 0 }
  if (exp > -1000) {
    return {
      re: sx.mantissa * 2 ** sx.exponent,
      im: sy.mantissa * 2 ** sy.exponent,
      exp: 0,
    }
  }
  // A zero component has exponent -Infinity: 0 * 2^Infinity would be NaN.
  return {
    re: x === 0n ? 0 : sx.mantissa * 2 ** (sx.exponent - exp),
    im: y === 0n ? 0 : sy.mantissa * 2 ** (sy.exponent - exp),
    exp,
  }
}

/**
 * Iterate `Z <- Z^2 + c` exactly, yielding the number of values stored so far
 * every `ORBIT_SLICE` iterations and returning the finished orbit.
 */
export function* iterateOrbit(
  spec: OrbitSpec,
): Generator<number, ReferenceOrbit, void> {
  const bits = Math.max(8, Math.ceil(spec.bits))
  const b = BigInt(bits)
  const b1 = BigInt(bits - 1)
  const toDouble = bits > 64 ? BigInt(bits - 64) : 0n
  const toDoubleScale = bits > 64 ? 2 ** -64 : 2 ** -bits
  const cx = parseFixed(spec.cRe, bits) ?? 0n
  const cy = parseFixed(spec.cIm, bits) ?? 0n
  let x = parseFixed(spec.startRe, bits) ?? 0n
  let y = parseFixed(spec.startIm, bits) ?? 0n
  const limit = Math.max(1, Math.floor(spec.maxIterations)) + 1
  const radius2 = spec.escapeRadius * spec.escapeRadius
  let capacity = Math.min(limit, 1 << 16)
  let z = new Float64Array(2 * capacity)
  let zExp = new Int32Array(capacity)
  let length = 0
  let escaped = false
  while (length < limit) {
    const v = toScaledPair(x, y, bits, toDouble, toDoubleScale)
    if (length >= capacity) {
      capacity = Math.min(limit, capacity * 2)
      const grownZ = new Float64Array(2 * capacity)
      grownZ.set(z)
      z = grownZ
      const grownE = new Int32Array(capacity)
      grownE.set(zExp)
      zExp = grownE
    }
    z[2 * length] = v.re
    z[2 * length + 1] = v.im
    zExp[length] = v.exp
    length += 1
    if (v.exp === 0 && v.re * v.re + v.im * v.im > radius2) {
      escaped = true
      break
    }
    const x2 = (x * x) >> b
    const y2 = (y * y) >> b
    const xy = (x * y) >> b1
    x = x2 - y2 + cx
    y = xy + cy
    if (length % ORBIT_SLICE === 0) yield length
  }
  return {
    z: z.slice(0, 2 * length),
    zExp: zExp.slice(0, length),
    length,
    escaped,
  }
}

/** Run an orbit to completion synchronously. For tests and small orbits. */
export function computeOrbit(spec: OrbitSpec): ReferenceOrbit {
  const run = iterateOrbit(spec)
  for (;;) {
    const step = run.next()
    if (step.done) return step.value
  }
}
