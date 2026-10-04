/**
 * Saved deep-zoom pictures are named for what they show and when, so a second
 * save never collides with the first.
 */
import { DEFAULT_LOCATION } from '@chaos-master/core'
import { describe, expect, it } from 'vitest'
import { explorerFileName } from './explorerFileName'

const DEEP = {
  ...DEFAULT_LOCATION,
  view: { ...DEFAULT_LOCATION.view, zoomLog2: 40 },
}
const AT = new Date(2026, 9, 4, 12, 20, 45)

describe('explorerFileName', () => {
  it('names the set, the magnification and the moment', () => {
    expect(explorerFileName(DEEP, AT)).toBe(
      'mandelbrot-x1_10e12-1004-122045.png',
    )
    expect(explorerFileName({ ...DEEP, kind: 'julia' }, AT)).toBe(
      'julia-x1_10e12-1004-122045.png',
    )
    expect(explorerFileName({ ...DEEP, split: true }, AT)).toBe(
      'mandelbrot-julia-x1_10e12-1004-122045.png',
    )
  })

  it('pads every field, so names sort by time', () => {
    expect(explorerFileName(DEEP, new Date(2026, 0, 2, 3, 4, 5))).toBe(
      'mandelbrot-x1_10e12-0102-030405.png',
    )
  })

  it('gives two saves a second apart different names', () => {
    const later = new Date(AT.getTime() + 1000)
    expect(explorerFileName(DEEP, later)).not.toBe(explorerFileName(DEEP, AT))
  })
})
