/**
 * The floatexp primitives: `exponentOf` normalises any finite non-zero
 * double, subnormals included, into [0.5, 1), and `scalePow2` gets there
 * through exponents a double cannot hold on its own.
 */
import { describe, expect, it } from 'vitest'
import { exponentOf, scalePow2 } from './floatExp'

describe('exponentOf', () => {
  it.each([
    1,
    0.5,
    0.75,
    -3,
    2 ** 52 + 1,
    2 ** -1022,
    1e-310,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
  ])('puts |%s| * 2^-k in [0.5, 1)', (x) => {
    const m = scalePow2(Math.abs(x), -exponentOf(x))
    expect(m).toBeGreaterThanOrEqual(0.5)
    expect(m).toBeLessThan(1)
  })
})

describe('scalePow2', () => {
  it('scales past the double exponent range without overflowing on the way', () => {
    expect(scalePow2(2 ** -100, 1100)).toBe(2 ** 1000)
    expect(scalePow2(2 ** 100, -1100)).toBe(2 ** -1000)
    expect(scalePow2(3, 4)).toBe(48)
  })
})
