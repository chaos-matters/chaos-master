import { describe, expect, it } from 'vitest'
import { bitLength, decomposeNumber, fixedToNumber, fixedToScaledNumber, formatFixed, numberToFixed, parseFixed, scaledNumberToFixed, shiftRound, } from './bigFixed'

describe('decomposeNumber', () => {
  it.each([1, -1, 0.5, 3, -0.1, 1e-300, 5e-324, 1.7976931348623157e308])(
    'reassembles %p exactly',
    (x) => {
      const { mantissa, exponent } = decomposeNumber(x)
      expect(Number(mantissa) * 2 ** exponent).toBe(x)
    },
  )

  it('rejects non-finite input', () => {
    expect(() => decomposeNumber(Number.NaN)).toThrow(RangeError)
  })
})

describe('shiftRound', () => {
  it('rounds half away from zero on both signs', () => {
    expect(shiftRound(3n, -1)).toBe(2n)
    expect(shiftRound(-3n, -1)).toBe(-2n)
    expect(shiftRound(5n, -2)).toBe(1n)
    expect(shiftRound(6n, -2)).toBe(2n)
    expect(shiftRound(3n, 4)).toBe(48n)
  })
})

describe('parseFixed and formatFixed', () => {
  it('round-trips a deep coordinate digit for digit', () => {
    const text = '-0.7436438870371587047521915061147745'
    const v = parseFixed(text, 200)!
    expect(formatFixed(v, 200, 34)).toBe(text)
  })

  it('reads exponent notation', () => {
    expect(fixedToNumber(parseFixed('1.5e-3', 80)!, 80)).toBe(0.0015)
    expect(fixedToNumber(parseFixed('-2E2', 80)!, 80)).toBe(-200)
    expect(fixedToNumber(parseFixed('.25', 16)!, 16)).toBe(0.25)
  })

  it('rejects text that is not a number', () => {
    for (const bad of ['', '.', 'abc', '1.2.3', '1e', '--1', '0x10']) {
      expect(parseFixed(bad, 64)).toBeUndefined()
    }
  })

  it('does not print a negative zero', () => {
    expect(formatFixed(-1n, 64, 3)).toBe('0')
  })
})

describe('number conversions', () => {
  it('converts doubles exactly into fixed point and back', () => {
    for (const x of [0, 1, -1.25, Math.PI, -0.743643887037158]) {
      expect(fixedToNumber(numberToFixed(x, 120), 120)).toBe(x)
    }
  })

  it('places a scaled number far below double range', () => {
    const v = scaledNumberToFixed(0.75, -2000, 2100)
    const back = fixedToScaledNumber(v, 2100)
    expect(back.mantissa).toBe(0.75)
    expect(back.exponent).toBe(-2000)
  })

  it('measures bit length', () => {
    expect(bitLength(0n)).toBe(0)
    expect(bitLength(1n)).toBe(1)
    expect(bitLength(-255n)).toBe(8)
    expect(bitLength(256n)).toBe(9)
    expect(bitLength(1n << 1000n)).toBe(1001)
  })
})
