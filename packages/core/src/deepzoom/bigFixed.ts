/**
 * Arbitrary-precision fixed-point reals on `BigInt`, for deep-zoom coordinates.
 *
 * A value is a `bigint` `v` read as `v / 2^bits`, with `bits` passed alongside
 * rather than stored, because every value in one computation shares it. A
 * float64 runs out of digits near a magnification of 1e15; a fixed-point
 * integer never does, it only gets longer. That is the whole reason this file
 * exists: the centre of a view zoomed to 1e300 needs a thousand bits, and the
 * reference orbit iterated there needs them at every step.
 */

export const LOG10_2 = Math.log10(2)

const f64Scratch = new Float64Array(1)
const u64Scratch = new BigUint64Array(f64Scratch.buffer)

/**
 * Split a finite double into an integer mantissa and a power of two, exactly:
 * `x === mantissa * 2^exponent`. Reading the bits avoids `Math.log2`, which is
 * off by one at powers of two often enough to matter.
 */
export function decomposeNumber(x: number): {
  mantissa: bigint
  exponent: number
} {
  if (!Number.isFinite(x)) {
    throw new RangeError(`cannot decompose a non-finite number: ${x}`)
  }
  if (x === 0) return { mantissa: 0n, exponent: 0 }
  f64Scratch[0] = x
  const raw = u64Scratch[0]!
  const negative = raw >> 63n === 1n
  const biased = Number((raw >> 52n) & 0x7ffn)
  const fraction = raw & ((1n << 52n) - 1n)
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n)
  const exponent = biased === 0 ? -1074 : biased - 1075
  return { mantissa: negative ? -mantissa : mantissa, exponent }
}

/** `v * 2^shift`, rounding half away from zero when bits fall off the right. */
export function shiftRound(v: bigint, shift: number): bigint {
  if (shift >= 0) return v << BigInt(shift)
  const s = BigInt(-shift)
  const half = 1n << (s - 1n)
  return v >= 0n ? (v + half) >> s : -((-v + half) >> s)
}

/** Re-express a fixed-point value at a different number of fraction bits. */
export function rescaleFixed(
  v: bigint,
  fromBits: number,
  toBits: number,
): bigint {
  return shiftRound(v, toBits - fromBits)
}

/** `mantissa * 2^exponent` as fixed point, for mantissa any finite double. */
export function scaledNumberToFixed(
  mantissa: number,
  exponent: number,
  bits: number,
): bigint {
  const d = decomposeNumber(mantissa)
  return shiftRound(d.mantissa, d.exponent + exponent + bits)
}

export function numberToFixed(x: number, bits: number): bigint {
  return scaledNumberToFixed(x, 0, bits)
}

/**
 * The nearest double, for values of ordinary size. Only the top 64 bits take
 * part, so this is exact to double precision and never builds a string.
 */
export function fixedToNumber(v: bigint, bits: number): number {
  if (bits <= 64) return Number(v) * 2 ** -bits
  return Number(v >> BigInt(bits - 64)) * 2 ** -64
}

/** Number of significant bits of `|v|`; 0 for zero. */
export function bitLength(v: bigint): number {
  if (v === 0n) return 0
  const hex = (v < 0n ? -v : v).toString(16)
  return (hex.length - 1) * 4 + (32 - Math.clz32(parseInt(hex[0]!, 16)))
}

/**
 * A value of any size as `mantissa * 2^exponent` with the mantissa a double
 * in [0.5, 1) (or 0). This is what survives when the value is far smaller
 * than a double can hold: a pixel offset at a magnification of 1e400.
 */
export function fixedToScaledNumber(
  v: bigint,
  bits: number,
): { mantissa: number; exponent: number } {
  if (v === 0n) return { mantissa: 0, exponent: 0 }
  const length = bitLength(v)
  const drop = Math.max(0, length - 60)
  const top = Number(v >> BigInt(drop))
  const mantissa = top * 2 ** -(length - drop)
  return { mantissa, exponent: length - bits }
}

const DECIMAL = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/

/**
 * Parse a decimal string exactly into fixed point, rounding once at the end.
 * Returns `undefined` for anything that is not a plain decimal number, so a
 * pasted coordinate can be rejected instead of silently becoming zero.
 */
export function parseFixed(text: string, bits: number): bigint | undefined {
  const match = DECIMAL.exec(text)
  if (!match) return undefined
  const [, sign = '', whole = '', fraction = '', exp = '0'] = match
  if (whole === '' && fraction === '') return undefined
  const digits = BigInt(`${whole}${fraction}` || '0')
  const power = Number(exp) - fraction.length
  if (!Number.isFinite(power) || Math.abs(power) > 100_000) return undefined
  let magnitude: bigint
  if (power >= 0) {
    magnitude = (digits * 10n ** BigInt(power)) << BigInt(bits)
  } else {
    const den = 10n ** BigInt(-power)
    magnitude = ((digits << BigInt(bits + 1)) + den) / (2n * den)
  }
  return sign === '-' ? -magnitude : magnitude
}

/**
 * Format with `digits` places after the point, rounded, trailing zeros
 * dropped. Plain positional notation: a coordinate is copied, pasted and
 * compared by eye, and exponent notation hides where the digits line up.
 */
export function formatFixed(v: bigint, bits: number, digits: number): string {
  const places = Math.max(0, Math.floor(digits))
  const negative = v < 0n
  const magnitude = negative ? -v : v
  const scaled = magnitude * 10n ** BigInt(places)
  const q = bits > 0 ? shiftRound(scaled, -bits) : scaled << BigInt(-bits)
  const text = q.toString().padStart(places + 1, '0')
  const whole = text.slice(0, text.length - places)
  const fraction = text.slice(text.length - places).replace(/0+$/, '')
  const body = fraction === '' ? whole : `${whole}.${fraction}`
  return negative && q !== 0n ? `-${body}` : body
}

/** Decimal places that resolve a step of `2^-bits`, plus a little slack. */
export function decimalPlacesForBits(bits: number): number {
  return Math.ceil(bits * LOG10_2) + 2
}
