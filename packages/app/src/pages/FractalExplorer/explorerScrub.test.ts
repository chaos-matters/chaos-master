/**
 * Scrubbed values land on what a field would show: c on five decimals at
 * most, the iteration limit on two significant figures inside its limits.
 */
import { describe, expect, it } from 'vitest'
import { clampedLog2, scrubbedDecimal, scrubbedIterations, } from './explorerScrub'

describe('scrubbedDecimal', () => {
  it.each([
    [-0.8 + 0.02, '-0.78'],
    [0.156 + 0.0001, '0.1561'],
    [-1.234567891, '-1.23457'],
    [1, '1'],
    [-0.000001, '0'],
  ])('shows %d as %s', (value, text) => {
    expect(scrubbedDecimal(value)).toBe(text)
  })

  it('refuses a value no link could carry', () => {
    expect(scrubbedDecimal(5000)).toBeUndefined()
  })
})

describe('scrubbedIterations', () => {
  it('doubles every 100 px and lands on two significant figures', () => {
    const start = Math.log2(1000)
    expect(scrubbedIterations(start)).toBe(1000)
    expect(scrubbedIterations(start + 1)).toBe(2000)
    expect(scrubbedIterations(start + 0.1)).toBe(1100)
    expect(scrubbedIterations(start - 1)).toBe(500)
  })

  it('stays inside the limits, with no overshoot to drag back through', () => {
    expect(scrubbedIterations(clampedLog2(100))).toBe(4_000_000)
    expect(scrubbedIterations(clampedLog2(-100))).toBe(16)
    expect(clampedLog2(clampedLog2(100) + 1)).toBe(clampedLog2(100))
  })
})
