// Value-pinned 3D affine: rows a,b,c,d / e,f,g,h / i,j,k,l, translation d,h,l.
import { vec3f } from 'typegpu/data'
import { describe, expect, it } from 'vitest'
import { transformAffine3D } from './affineTransform3D'

const IDENTITY = {
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
  l: 0,
}
const apply = (t: typeof IDENTITY, x: number, y: number, z: number) => {
  const p = transformAffine3D(t, vec3f(x, y, z))
  return [p.x, p.y, p.z]
}

describe('transformAffine3D', () => {
  it('leaves a point alone under identity', () => {
    expect(apply(IDENTITY, 1, 2, 3)).toEqual([1, 2, 3])
  })

  it('translates by d, h and l', () => {
    expect(apply({ ...IDENTITY, d: 5, h: -2, l: 0.5 }, 1, 2, 3)).toEqual([
      6, 0, 3.5,
    ])
  })

  it('rotates 90 degrees about each axis', () => {
    // About z: (x, y, z) -> (-y, x, z)
    expect(apply({ ...IDENTITY, a: 0, b: -1, e: 1, f: 0 }, 1, 2, 3)).toEqual([
      -2, 1, 3,
    ])
    // About x: (x, y, z) -> (x, -z, y)
    expect(apply({ ...IDENTITY, f: 0, g: -1, j: 1, k: 0 }, 1, 2, 3)).toEqual([
      1, -3, 2,
    ])
    // About y: (x, y, z) -> (z, y, -x)
    expect(apply({ ...IDENTITY, a: 0, c: 1, i: -1, k: 0 }, 1, 2, 3)).toEqual([
      3, 2, -1,
    ])
  })

  it('uses every coefficient in its own place', () => {
    const t = {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      g: 7,
      h: 8,
      i: 9,
      j: 10,
      k: 11,
      l: 12,
    }
    // 1+4+9+4, 5+12+21+8, 9+20+33+12
    expect(apply(t, 1, 2, 3)).toEqual([18, 46, 74])
  })
})
