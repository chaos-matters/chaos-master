/**
 * The framing arithmetic behind the chrome that floats over the canvas, the
 * tablet deck at the trailing edge, the glass desktop sidebar at the leading
 * one and the rail's glass sheet at the bottom: how much of the canvas each
 * covers, where the camera's centre goes, and which part of an image of the
 * canvas is the picture (lib/canvasFraming.ts).
 */
import { mat4x4f } from 'typegpu/data'
import { describe, expect, it } from 'vitest'
import { mat4 } from 'wgpu-matrix'
import { coveredFraction, framingShift, MAX_COVERED_FRACTION, NO_SHIFT, NOT_COVERED, shiftClipTransform, visibleAspect, visibleRegion, } from './canvasFraming'

/** 1180 x 820 landscape: an 80 px rail, then a canvas 1100 px wide that runs
 *  under a 380 px deck. */
const deck = { left: 0, right: coveredFraction(380, 1100), bottom: 0 }

/** 1920 x 1080 with the wide sidebar, 26rem: the canvas box spans the whole
 *  width and the sidebar covers 409.6 px of it, its width less the 0.4rem the
 *  setting-off canvas already runs under it. That canvas is 1510.4 px wide
 *  from x 409.6, exactly what is left. */
const sidebar = { left: coveredFraction(416 - 6.4, 1920), right: 0, bottom: 0 }

/** 390 x 844 phone, the rail's sheet at medium: 44% of the viewport, 371 px,
 *  less the 96 px it covers at peek as well, over a canvas the full height. */
const rail = { left: 0, right: 0, bottom: coveredFraction(371 - 96, 844) }

describe('coveredFraction', () => {
  it('is the covered width over the canvas width', () => {
    expect(deck.right).toBeCloseTo(0.345455, 6)
    expect(sidebar.left).toBeCloseTo(0.213333, 6)
  })

  it('is 0 for no cover and for a canvas not yet laid out', () => {
    expect(coveredFraction(0, 1100)).toBe(0)
    expect(coveredFraction(380, 0)).toBe(0)
    expect(coveredFraction(380, Number.NaN)).toBe(0)
    expect(coveredFraction(Number.NaN, 1100)).toBe(0)
    expect(coveredFraction(-10, 1100)).toBe(0)
  })

  it('stops short of the whole canvas', () => {
    expect(coveredFraction(2000, 1000)).toBe(MAX_COVERED_FRACTION)
  })
})

describe('framingShift', () => {
  it('puts the centre in the middle of what the deck leaves', () => {
    const shift = framingShift(deck)
    // In pixels: the canvas centre is at 550, the visible part's at 360,
    // 190 px (half the deck) to the left. In clip units that is 190 / 550.
    expect(shift.x).toBeCloseTo(-190 / 550, 6)
    expect(shift.y).toBe(0)
  })

  it('puts the centre in the middle of what the sidebar leaves', () => {
    const shift = framingShift(sidebar)
    // The canvas centre is at 960, the visible part's, from 409.6 to 1920,
    // at 1164.8: 204.8 px to the right, 204.8 / 960 in clip units.
    expect(shift.x).toBeCloseTo(204.8 / 960, 6)
    expect(shift.y).toBe(0)
  })

  it('puts the centre in the middle of what both leave', () => {
    // 200 px covered on the left and 380 on the right of 1100 leave 200 to
    // 720, whose middle, 460, is 90 px left of the canvas centre.
    const shift = framingShift({
      left: coveredFraction(200, 1100),
      right: coveredFraction(380, 1100),
      bottom: 0,
    })
    expect(shift.x).toBeCloseTo(-90 / 550, 6)
    expect(shift.y).toBe(0)
  })

  it('is no shift at all when nothing covers the canvas', () => {
    expect(framingShift(NOT_COVERED)).toBe(NO_SHIFT)
    expect(framingShift({ left: 0, right: Number.NaN, bottom: 0 })).toBe(
      NO_SHIFT,
    )
    expect(framingShift({ left: Number.NaN, right: -1, bottom: 0 })).toBe(
      NO_SHIFT,
    )
  })

  it("raises the centre as far as the setting-off canvas's slide", () => {
    // With the setting off the canvas slides up by half the 275 px the sheet
    // covers (App.module.css, .canvas): 137.5 px, which is 137.5 / 422 in
    // clip units of an 844 px canvas. The shift puts the centre there.
    const shift = framingShift(rail)
    expect(shift.x).toBe(0)
    expect(shift.y).toBeCloseTo(137.5 / 422, 6)
    expect(shift.y).toBeCloseTo(rail.bottom, 12)
  })

  it('moves the centre both ways when the sides and the bottom are covered', () => {
    const shift = framingShift({ ...deck, bottom: rail.bottom })
    expect(shift.x).toBeCloseTo(-190 / 550, 6)
    expect(shift.y).toBeCloseTo(rail.bottom, 12)
    expect(framingShift({ left: 0, right: 0, bottom: Number.NaN })).toBe(
      NO_SHIFT,
    )
  })

  it('is no shift when both edges cover the same', () => {
    expect(framingShift({ left: 0.2, right: 0.2, bottom: 0 })).toBe(NO_SHIFT)
  })
})

describe('visibleRegion', () => {
  it('keeps the width the deck leaves and the whole height, from the left', () => {
    expect(visibleRegion(1100, 820, deck)).toEqual({
      x: 0,
      y: 0,
      width: 720,
      height: 820,
    })
    // An iPad's backing store, at twice the CSS size.
    expect(visibleRegion(2200, 1640, deck)).toEqual({
      x: 0,
      y: 0,
      width: 1440,
      height: 1640,
    })
  })

  it('starts where the sidebar ends, and is the setting-off canvas', () => {
    // The setting-off canvas's backing store is 1510 x 1080 at a pixel ratio
    // of 1, and 3021 x 2160 at 2 (1510.39 CSS px, rounded).
    expect(visibleRegion(1920, 1080, sidebar)).toEqual({
      x: 410,
      y: 0,
      width: 1510,
      height: 1080,
    })
    expect(visibleRegion(3840, 2160, sidebar)).toEqual({
      x: 819,
      y: 0,
      width: 3021,
      height: 2160,
    })
  })

  it('keeps what both leave', () => {
    const both = {
      left: coveredFraction(200, 1100),
      right: coveredFraction(380, 1100),
      bottom: 0,
    }
    expect(visibleRegion(1100, 820, both)).toEqual({
      x: 200,
      y: 0,
      width: 520,
      height: 820,
    })
  })

  it('is the whole image when nothing covers it', () => {
    expect(visibleRegion(1100, 820, NOT_COVERED)).toEqual({
      x: 0,
      y: 0,
      width: 1100,
      height: 820,
    })
  })

  it('keeps at least a pixel, and never more than the image', () => {
    expect(
      visibleRegion(3, 3, { left: 0, right: MAX_COVERED_FRACTION, bottom: 0 })
        .width,
    ).toBe(1)
    const leftmost = visibleRegion(3, 3, {
      left: MAX_COVERED_FRACTION,
      right: 0,
      bottom: 0,
    })
    expect(leftmost.width).toBe(1)
    expect(leftmost.x + leftmost.width).toBeLessThanOrEqual(3)
    expect(visibleRegion(0, 0, { left: 0, right: 0.5, bottom: 0 }).width).toBe(
      0,
    )
  })

  it('keeps the height the sheet leaves, from the top, and the whole width', () => {
    expect(visibleRegion(390, 844, rail)).toEqual({
      x: 0,
      y: 0,
      width: 390,
      height: 569,
    })
    // At a pixel ratio of 3.
    expect(visibleRegion(1170, 2532, rail)).toEqual({
      x: 0,
      y: 0,
      width: 1170,
      height: 1707,
    })
  })

  it('is centred on the flame, a crop of the setting-off picture', () => {
    // The flame's centre is (1 - shift) / 2 of the way down the canvas: row
    // 284.5 of 844, the middle of the 569 rows kept. The setting-off picture
    // has it at row 422, so the cut drops 137.5 rows from its top and as
    // many from its bottom, and keeps the scale.
    const centreRow = (844 * (1 - framingShift(rail).y)) / 2
    expect(centreRow).toBeCloseTo(visibleRegion(390, 844, rail).height / 2, 6)
  })

  it('stops the bottom short of the whole height, without touching the sides', () => {
    const region = visibleRegion(1000, 1000, {
      left: 0.6,
      right: 0.6,
      bottom: 0.95,
    })
    expect(region).toEqual({ x: 450, y: 0, width: 100, height: 100 })
    expect(framingShift({ left: 0, right: 0, bottom: 0.95 }).y).toBe(
      MAX_COVERED_FRACTION,
    )
  })

  it('scales both covers down alike when together they would cover too much', () => {
    // 0.6 and 0.6 are cut to 0.45 each: a tenth of the width, in the middle.
    const region = visibleRegion(1000, 500, {
      left: 0.6,
      right: 0.6,
      bottom: 0,
    })
    expect(region).toEqual({ x: 450, y: 0, width: 100, height: 500 })
    expect(framingShift({ left: 0.6, right: 0.6, bottom: 0 })).toBe(NO_SHIFT)
    const lopsided = { left: 0.8, right: 0.4, bottom: 0 }
    const scale = MAX_COVERED_FRACTION / 1.2
    expect(framingShift(lopsided).x).toBeCloseTo((0.8 - 0.4) * scale, 6)
    expect(visibleRegion(1000, 500, lopsided).width).toBe(100)
  })
})

describe('visibleAspect', () => {
  it('is the aspect of what the deck leaves visible', () => {
    // The setting-off canvas is exactly that part: 720 x 820.
    expect(visibleAspect(1100, 820, deck)).toBeCloseTo(720 / 820, 6)
  })

  it('is the aspect of what the sidebar leaves visible', () => {
    expect(visibleAspect(1920, 1080, sidebar)).toBeCloseTo(1510.4 / 1080, 6)
  })

  it('is the aspect of what both leave visible', () => {
    const both = {
      left: coveredFraction(200, 1100),
      right: coveredFraction(380, 1100),
      bottom: 0,
    }
    expect(visibleAspect(1100, 820, both)).toBeCloseTo(520 / 820, 6)
  })

  it('is the aspect of what the sheet leaves visible', () => {
    expect(visibleAspect(390, 844, rail)).toBeCloseTo(390 / 569, 6)
  })

  it('is the canvas aspect when nothing covers it', () => {
    expect(visibleAspect(1100, 820, NOT_COVERED)).toBeCloseTo(1100 / 820, 6)
    expect(visibleAspect(1100, 0, NOT_COVERED)).toBe(1)
  })
})

describe('shiftClipTransform', () => {
  const project = (m: ArrayLike<number>, p: readonly number[]) => {
    const [x, y, z] = p as [number, number, number]
    const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!
    const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!
    const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
    return [cx / cw, cy / cw]
  }
  const viewProjection = () => {
    const view = mat4.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0])
    const projection = mat4.perspective(Math.PI / 3, 1100 / 820, 0.01, 100)
    return mat4.mul(projection, view)
  }

  it('moves the target, the vanishing point, by the shift', () => {
    const shifted = shiftClipTransform(viewProjection(), { x: -0.3, y: 0 })
    const [x, y] = project(shifted, [0, 0, 0])
    expect(x).toBeCloseTo(-0.3, 6)
    expect(y).toBeCloseTo(0, 6)
  })

  it('moves every point by the same amount on screen, near or far', () => {
    const plain = viewProjection()
    const shifted = shiftClipTransform(viewProjection(), { x: -0.3, y: 0.1 })
    for (const point of [
      [1, 0.5, 0],
      [-2, 1, -3],
      [0.5, -1, 2],
    ]) {
      const [px, py] = project(plain, point)
      const [sx, sy] = project(shifted, point)
      expect(sx! - px!).toBeCloseTo(-0.3, 5)
      expect(sy! - py!).toBeCloseTo(0.1, 5)
    }
  })

  it('writes the matrix it is given, and leaves it be for no shift', () => {
    const matrix = viewProjection()
    const before = Array.from(matrix)
    expect(shiftClipTransform(matrix, NO_SHIFT)).toBe(matrix)
    expect(Array.from(matrix)).toEqual(before)

    expect(shiftClipTransform(matrix, { x: -0.3, y: 0 })).toBe(matrix)
    expect(Array.from(matrix)).not.toEqual(before)
  })

  it('shifts the GPU matrix type the camera writes to its uniforms', () => {
    // Camera3D builds a typegpu mat4x4f, whose elements are accessors.
    const matrix = mat4.mul(
      mat4.perspective(Math.PI / 3, 1100 / 820, 0.01, 100),
      mat4.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]),
      mat4x4f(),
    )
    shiftClipTransform(matrix, { x: -0.3, y: 0 })
    const [x, y] = project(matrix, [0, 0, 0])
    expect(x).toBeCloseTo(-0.3, 6)
    expect(y).toBeCloseTo(0, 6)
  })
})
