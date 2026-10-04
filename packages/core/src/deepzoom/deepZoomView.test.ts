import { describe, expect, it } from 'vitest'
import { centerOffsetPixels, formatMagnification, isValidView, log2PixelSpacing, MANDELBROT_HOME, panView, pointAt, viewBits, zoomViewAt, } from './deepZoomView'
import type { DeepZoomView } from './deepZoomView'

const SIZE = 1000

describe('pixel spacing', () => {
  it('shows a radius of 2 at zoom 0', () => {
    // 1000 pixels across a diameter of 4.
    expect(2 ** log2PixelSpacing(0, SIZE)).toBeCloseTo(0.004, 12)
  })

  it('asks for more bits the deeper the view', () => {
    expect(viewBits(0, SIZE)).toBe(72)
    expect(viewBits(1000, SIZE)).toBeGreaterThan(1000)
  })
})

describe('zoomViewAt', () => {
  it('keeps the point under the pointer fixed', () => {
    const view: DeepZoomView = {
      centerRe: '-0.5',
      centerIm: '0.25',
      zoomLog2: 3,
    }
    const before = pointAt(view, 120, -40, SIZE)
    const zoomed = zoomViewAt(view, 120, -40, SIZE, 1.5)
    const after = pointAt(zoomed, 120, -40, SIZE)
    expect(Number(after.re)).toBeCloseTo(Number(before.re), 12)
    expect(Number(after.im)).toBeCloseTo(Number(before.im), 12)
  })

  it('zooms about the centre when the pointer is at the centre', () => {
    const zoomed = zoomViewAt(MANDELBROT_HOME, 0, 0, SIZE, 10)
    expect(zoomed.centerRe).toBe('-0.75')
    expect(zoomed.centerIm).toBe('0')
    expect(zoomed.zoomLog2).toBeCloseTo(10.4, 12)
  })

  it('stays exact a thousand octaves down', () => {
    let view: DeepZoomView = { centerRe: '-1.25', centerIm: '0', zoomLog2: 0 }
    // Walk in with a sideways pointer each step, then check that one pixel
    // step still moves the centre by exactly one pixel.
    for (let i = 0; i < 100; i += 1) view = zoomViewAt(view, 3, -2, SIZE, 10)
    expect(view.zoomLog2).toBe(1000)
    expect(view.centerRe.length).toBeGreaterThan(300)
    const moved = panView(view, -1, 0, SIZE)
    const offset = centerOffsetPixels(
      moved,
      { re: view.centerRe, im: view.centerIm },
      SIZE,
    )
    // The printed centre keeps a few bits past a pixel, so this is exact
    // to a small fraction of one.
    expect(offset.x).toBeCloseTo(1, 3)
    expect(offset.y).toBeCloseTo(0, 3)
  })
})

describe('panView', () => {
  it('drags the plane with the pointer, imaginary axis up', () => {
    const view: DeepZoomView = { centerRe: '0', centerIm: '0', zoomLog2: 0 }
    const moved = panView(view, 250, 250, SIZE)
    // Pointer right and down: the centre moves left and up in the plane.
    expect(Number(moved.centerRe)).toBeCloseTo(-1, 12)
    expect(Number(moved.centerIm)).toBeCloseTo(1, 12)
  })

  it('shortens the printed centre when zoomed back out', () => {
    let view: DeepZoomView = { centerRe: '-1.25', centerIm: '0.1', zoomLog2: 0 }
    view = zoomViewAt(view, 7, 3, SIZE, 200)
    const deep = view.centerRe.length
    view = zoomViewAt(view, 0, 0, SIZE, -190)
    view = panView(view, 0, 0, SIZE)
    expect(view.centerRe.length).toBeLessThan(deep)
  })
})

describe('centerOffsetPixels', () => {
  it('stays finite past the range of a double (1e903)', () => {
    const deep = { centerRe: '-0.75', centerIm: '0.1', zoomLog2: 3000 }
    const reference = { re: deep.centerRe, im: deep.centerIm }
    expect(centerOffsetPixels(deep, reference, 800)).toEqual({ x: 0, y: 0 })
    const moved = panView(deep, -3, 2, 800)
    const offset = centerOffsetPixels(moved, reference, 800)
    expect(offset.x).toBeCloseTo(3, 2)
    expect(offset.y).toBeCloseTo(2, 2)
  })

  it('measures the centre from a reference in pixels, y up', () => {
    const view: DeepZoomView = {
      centerRe: '0.004',
      centerIm: '-0.008',
      zoomLog2: 0,
    }
    const offset = centerOffsetPixels(view, { re: '0', im: '0' }, SIZE)
    expect(offset.x).toBeCloseTo(1, 9)
    expect(offset.y).toBeCloseTo(-2, 9)
  })
})

describe('validation and readout', () => {
  it('rejects garbage coordinates', () => {
    expect(isValidView({ centerRe: 'x', centerIm: '0', zoomLog2: 0 })).toBe(
      false,
    )
    expect(
      isValidView({ centerRe: '1', centerIm: '0', zoomLog2: Number.NaN }),
    ).toBe(false)
    expect(isValidView(MANDELBROT_HOME)).toBe(true)
  })

  it('prints magnifications a person can read', () => {
    expect(formatMagnification(0)).toBe('1.00')
    expect(formatMagnification(Math.log2(100))).toBe('100')
    expect(formatMagnification(Math.log2(1234))).toBe('1234')
    expect(formatMagnification(100)).toBe('1.27e30')
  })
})
