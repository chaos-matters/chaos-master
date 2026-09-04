import { describe, expect, it } from 'vitest'
import { basis3D, depthFromScreenDelta, ensure3DAffine, project3D, unproject3D, } from './affine3DView'

const FLAT = { a: 2, b: 0.5, c: 0.25, d: -0.5, e: 1.5, f: 0.75 }

describe('ensure3DAffine', () => {
  it('promotes a 2D affine without collapsing it to a plane', () => {
    // The trap: a 2D affine's y-row (d,e,f) landing in the 3D y-row pancakes
    // the transform. The mapping has to move `c` and `f` into the translation
    // column and open a real z-row.
    const t = ensure3DAffine(FLAT)
    expect([t.a, t.b, t.c, t.d]).toEqual([2, 0.5, 0, 0.25])
    expect([t.e, t.f, t.g, t.h]).toEqual([-0.5, 1.5, 0, 0.75])
    expect([t.i, t.j, t.k, t.l]).toEqual([0, 0, 1, 0])
  })

  it('leaves an affine that is already 3D alone', () => {
    const already = { ...ensure3DAffine(FLAT), k: 3 }
    expect(ensure3DAffine(already)).toEqual(already)
  })
})

describe('the isometric projection', () => {
  it('round-trips through unproject at a known depth', () => {
    // Two screen axes cannot decide three world ones, so the inverse is only
    // a bijection with z held — which is exactly how a drag uses it.
    for (const [x, y, z] of [
      [0, 0, 0],
      [1.25, -0.5, 2],
      [-3, 4, -1.5],
    ] as const) {
      const p = project3D(x, y, z)
      const back = unproject3D(p.x, p.y, z)
      expect(back.x).toBeCloseTo(x, 10)
      expect(back.y).toBeCloseTo(y, 10)
    }
  })

  it('leaves the x/y plane untouched', () => {
    expect(project3D(1.5, -2, 0)).toEqual({ x: 1.5, y: -2 })
  })

  it('reads a depth from a drag along its own diagonal', () => {
    // One unit of depth displaces the handle by exactly project3D(0,0,1).
    const one = project3D(0, 0, 1)
    expect(depthFromScreenDelta(one.x, one.y)).toBeCloseTo(1, 10)
    expect(depthFromScreenDelta(-one.x, -one.y)).toBeCloseTo(-1, 10)
    // A drag square to the diagonal asks for no depth at all.
    expect(depthFromScreenDelta(one.y, -one.x)).toBeCloseTo(0, 10)
  })
})

describe('basis3D', () => {
  it('reads the origin and the three basis images off the matrix', () => {
    const b = basis3D(ensure3DAffine(FLAT))
    expect(b.o).toEqual({ x: 0.25, y: 0.75, z: 0 })
    // Images are the origin plus each column, which is why a drag sets the
    // difference and not the position.
    expect(b.x).toEqual({ x: 2.25, y: 0.25, z: 0 })
    expect(b.y).toEqual({ x: 0.75, y: 2.25, z: 0 })
    expect(b.z).toEqual({ x: 0.25, y: 0.75, z: 1 })
  })
})
