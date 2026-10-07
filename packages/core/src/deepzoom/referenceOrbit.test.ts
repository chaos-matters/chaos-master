import { describe, expect, it } from 'vitest'
import { computeOrbit, iterateOrbit, ORBIT_SLICE } from './referenceOrbit'

const base = {
  startRe: '0',
  startIm: '0',
  bits: 128,
  escapeRadius: 1000,
}

describe('computeOrbit', () => {
  it('matches plain double iteration where doubles are still exact enough', () => {
    const orbit = computeOrbit({
      ...base,
      cRe: '-0.1',
      cIm: '0.65',
      maxIterations: 40,
    })
    let x = 0
    let y = 0
    for (let n = 0; n < 40; n += 1) {
      expect(orbit.z[2 * n]).toBeCloseTo(x, 10)
      expect(orbit.z[2 * n + 1]).toBeCloseTo(y, 10)
      const nx = x * x - y * y - 0.1
      y = 2 * x * y + 0.65
      x = nx
    }
  })

  it('stops at the first value past the escape radius', () => {
    const orbit = computeOrbit({
      ...base,
      cRe: '1',
      cIm: '0',
      maxIterations: 100,
    })
    // 0, 1, 2, 5, 26, 677, 458330
    expect(orbit.escaped).toBe(true)
    expect(orbit.length).toBe(7)
    expect(orbit.z[12]).toBe(458330)
  })

  it('stores maxIterations + 1 values for a point that never escapes', () => {
    const orbit = computeOrbit({
      ...base,
      cRe: '-1',
      cIm: '0',
      maxIterations: 50,
    })
    expect(orbit.escaped).toBe(false)
    expect(orbit.length).toBe(51)
    // Period 2: 0, -1, 0, -1, ...
    expect(orbit.z[100]).toBe(0)
    expect(orbit.z[98]).toBe(-1)
  })

  it('starts a Julia orbit from its own point', () => {
    const orbit = computeOrbit({
      ...base,
      startRe: '0.5',
      startIm: '0',
      cRe: '0',
      cIm: '0',
      maxIterations: 3,
    })
    expect(Array.from(orbit.z.filter((_, i) => i % 2 === 0))).toEqual([
      0.5, 0.25, 0.0625, 0.00390625,
    ])
  })
})

describe('computeOrbit past 1e-300', () => {
  it('keeps a zero component zero when the other is below a double', () => {
    // c = -1 + 1e-331 on the real axis: Z_2 = -1e-331 + ..., with an exact
    // zero imaginary part, stored scaled. 0 * 2^Infinity used to make NaN.
    const orbit = computeOrbit({
      ...base,
      cRe: `-0.${'9'.repeat(331)}`,
      cIm: '0',
      bits: 1200,
      maxIterations: 8,
    })
    expect(orbit.zExp[2]).toBeLessThan(-1000)
    expect(Array.from(orbit.z).every(Number.isFinite)).toBe(true)
    expect(orbit.z[5]).toBe(0)
  })
})

describe('iterateOrbit', () => {
  it('yields between slices so a worker can abandon it', () => {
    const run = iterateOrbit({
      ...base,
      cRe: '-1',
      cIm: '0',
      maxIterations: ORBIT_SLICE * 3,
    })
    const first = run.next()
    expect(first.done).toBe(false)
    expect(first.value).toBe(ORBIT_SLICE)
  })
})
