/**
 * `toAffine3D`: the one lift from any affine to the 3D kernel's twelve
 * numbers. The 3D pipeline writes every flame's final transform through it,
 * so these are the exact values that write always had.
 */
import { describe, expect, it } from 'vitest'
import { toAffine3D } from './transformFunction3D'

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

describe('toAffine3D', () => {
  it('reads no affine as the identity', () => {
    expect(toAffine3D(undefined)).toEqual(IDENTITY)
    expect(toAffine3D({})).toEqual(IDENTITY)
  })

  it('lifts a 2D affine, translation into d and h, z passed through', () => {
    expect(toAffine3D({ a: 2, b: 3, c: 4, d: 5, e: 6, f: 7 })).toEqual({
      a: 2,
      b: 3,
      c: 0,
      d: 4,
      e: 5,
      f: 6,
      g: 0,
      h: 7,
      i: 0,
      j: 0,
      k: 1,
      l: 0,
    })
  })

  it('keeps a 3D affine and fills its missing fields from the identity', () => {
    const full = {
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
    expect(toAffine3D(full)).toEqual(full)
    expect(toAffine3D({ l: 2 })).toEqual({ ...IDENTITY, l: 2 })
  })

  it('lifts an affine that holds g-l as a 2D one when told its layout is 2D', () => {
    const held = { a: 2, b: 3, c: 4, d: 5, e: 6, f: 7, g: 8, h: 9, i: 10 }
    expect(toAffine3D(held, '2D')).toEqual(
      toAffine3D({ a: 2, b: 3, c: 4, d: 5, e: 6, f: 7 }),
    )
    expect(toAffine3D(held, '3D')).toEqual(toAffine3D(held))
  })
})
