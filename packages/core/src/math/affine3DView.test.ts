import { describe, expect, it } from 'vitest'
import { basis3D, depthFromScreenDelta, ensure3DAffine, project3D, unproject3D, } from './affine3DView'

// 135 degrees at half scale: z moves the point by (-0.3536, +0.3536).
const Z = Math.SQRT1_2 / 2

describe('project3D / unproject3D', () => {
  it('projects depth along the fixed 135 degree diagonal', () => {
    const p = project3D(1, 2, 4)
    expect(p.x).toBeCloseTo(1 - 4 * Z, 12)
    expect(p.y).toBeCloseTo(2 + 4 * Z, 12)
  })

  it('inverts exactly for a known depth', () => {
    const p = project3D(-0.7, 1.3, 2.5)
    const back = unproject3D(p.x, p.y, 2.5)
    expect(back.x).toBeCloseTo(-0.7, 12)
    expect(back.y).toBeCloseTo(1.3, 12)
  })

  it('reads a screen drag along the diagonal back as depth', () => {
    const a = project3D(0, 0, 0)
    const b = project3D(0, 0, 3)
    expect(depthFromScreenDelta(b.x - a.x, b.y - a.y)).toBeCloseTo(3, 12)
  })
})

describe('ensure3DAffine', () => {
  it('moves the 2D rows into the kernel layout, coefficient by coefficient', () => {
    expect(
      ensure3DAffine({ a: 1.1, b: 2.2, c: 3.3, d: 4.4, e: 5.5, f: 6.6 }),
    ).toEqual({
      a: 1.1,
      b: 2.2,
      c: 0,
      d: 3.3,
      e: 4.4,
      f: 5.5,
      g: 0,
      h: 6.6,
      i: 0,
      j: 0,
      k: 1,
      l: 0,
    })
  })

  it('returns an affine that is already 3D unchanged', () => {
    const t = {
      a: 1,
      b: 0,
      c: 0,
      d: 0,
      e: 0,
      f: 1,
      g: 0,
      h: 0,
      i: 0,
      j: 0,
      k: 1,
      l: 0.5,
    }
    expect(ensure3DAffine(t)).toBe(t)
  })
})

describe('basis3D', () => {
  it('returns the origin and the three basis images', () => {
    const t = {
      a: 2,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 3,
      g: 0,
      h: -1,
      i: 0,
      j: 0,
      k: 4,
      l: 0.5,
    }
    expect(basis3D(t)).toEqual({
      o: { x: 1, y: -1, z: 0.5 },
      x: { x: 3, y: -1, z: 0.5 },
      y: { x: 1, y: 2, z: 0.5 },
      z: { x: 1, y: -1, z: 4.5 },
    })
  })
})
