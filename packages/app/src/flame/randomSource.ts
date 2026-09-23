/**
 * The ambient random source every randomizer draws from, and the one place
 * it is swapped. `withRandomSource` installs a source for the length of one
 * call, which is how the seeded wrappers (generate, mutate, breed, the
 * benchmarks) reproduce while ambient callers keep Math.random.
 *
 * This state must exist in exactly one module. A second copy would still
 * type-check and hand out plausible numbers, and every helper bound to it
 * would silently stop being seeded.
 */

export type RandomSource = () => number

let activeRandomSource: RandomSource = Math.random

/** Run `fn` with every random01()-based helper drawing from `source`.
 *  Exported for deterministic wrappers (seeded generate/mutate commands,
 *  benchmarks); ambient callers keep Math.random. */
export function withRandomSource<T>(source: RandomSource, fn: () => T): T {
  const previous = activeRandomSource
  activeRandomSource = source
  try {
    return fn()
  } finally {
    activeRandomSource = previous
  }
}

/** Small deterministic CPU PRNG used to snapshot reproducible generated flames. */
export function createSeededRandomSource(seed: number): RandomSource {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

export function random01(): number {
  return activeRandomSource()
}

export function randomRange(min: number, max: number): number {
  return min + random01() * (max - min)
}

export function randomPerturbation(
  current: number,
  sigma: number,
  clampRange?: [number, number],
): number {
  let sum = 0
  for (let i = 0; i < 6; i++) sum += random01()
  const gaussian = (sum - 3) * sigma
  const result = current + gaussian
  if (clampRange)
    return Math.max(clampRange[0], Math.min(clampRange[1], result))
  return result
}
