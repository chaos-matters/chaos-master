/**
 * The primitives of floating point with a separate integer exponent
 * ("floatexp").
 *
 * A double runs out of exponent at 2^±1023. The quantities a deep zoom
 * multiplies together — the bilinear-approximation coefficients, their
 * validity radii, a reference orbit passing near zero — go far past that, so
 * they are held as a mantissa times `2^e` with `e` an ordinary number. The
 * BLA builder (`bla.ts`), the GPU packing (`gpuPacking.ts`) and the kernel's
 * CPU mirror (`perturbation.ts`) each keep their own layout, in typed arrays
 * for speed; these are the pieces they share.
 *
 * Complex values share one exponent between the two parts: the larger part's
 * mantissa sits in [0.5, 1), and the smaller one is whatever it has to be.
 */

/** Exponent used for an exact zero, low enough to lose every comparison. */
export const ZERO_EXPONENT = -0x40000000

/** `x * 2^k` without overflowing on the way when `k` is large. */
export function scalePow2(x: number, k: number): number {
  if (k > 1000) return x * 2 ** 1000 * 2 ** (k - 1000)
  if (k < -1000) return x * 2 ** -1000 * 2 ** (k + 1000)
  return x * 2 ** k
}

/** The `k` with `|x| * 2^-k` in [0.5, 1), for finite non-zero `x`. */
export function exponentOf(x: number): number {
  const a = Math.abs(x)
  let k = Math.floor(Math.log2(a)) + 1
  const m = scalePow2(a, -k)
  if (m >= 1) k += 1
  else if (m < 0.5) k -= 1
  return k
}
