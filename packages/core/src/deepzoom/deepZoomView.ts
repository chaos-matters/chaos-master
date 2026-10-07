/**
 * The deep-zoom camera: a centre with unlimited digits and a magnification
 * held as a power of two.
 *
 * The centre is a decimal string because a string is the one format that
 * crosses a URL, the clipboard and a worker without losing a digit. Every
 * operation parses it into fixed point at the precision the current
 * magnification needs, moves it, and prints it back with only the digits
 * that are meaningful at that depth, so zooming back out also shortens it.
 *
 * Screen convention: pointer offsets are CSS-independent render pixels
 * measured from the canvas centre, x to the right and y DOWN. The complex
 * plane has the imaginary axis UP, so every conversion flips y once, here.
 */
import { decimalPlacesForBits, fixedToScaledNumber, formatFixed, LOG10_2, parseFixed, scaledNumberToFixed, } from './bigFixed'

export interface DeepZoomView {
  readonly centerRe: string
  readonly centerIm: string
  /** log2 of the magnification. 0 shows a radius of 2 around the centre. */
  readonly zoomLog2: number
}

export const MANDELBROT_HOME: DeepZoomView = {
  centerRe: '-0.75',
  centerIm: '0',
  zoomLog2: 0.4,
}

export const JULIA_HOME: DeepZoomView = {
  centerRe: '0',
  centerIm: '0',
  zoomLog2: 0,
}

/** Zooming out past this shows nothing but the escape colour. */
export const MIN_ZOOM_LOG2 = -3

/**
 * Deepest supported magnification, about 1e1000. The limit is the reference
 * orbit, not the GPU: its cost grows with the digit count, and past this a
 * single reference takes long enough that the explorer stops feeling live.
 */
export const MAX_ZOOM_LOG2 = 3320

/** Guard bits kept beyond one pixel, so the reference orbit stays exact. */
export const GUARD_BITS = 64

export function clampZoomLog2(zoomLog2: number): number {
  return Math.min(MAX_ZOOM_LOG2, Math.max(MIN_ZOOM_LOG2, zoomLog2))
}

/** log2 of the distance between neighbouring pixels in the complex plane. */
export function log2PixelSpacing(
  zoomLog2: number,
  minDimension: number,
): number {
  return 2 - zoomLog2 - Math.log2(Math.max(1, minDimension))
}

/** Fraction bits that resolve a pixel at this depth, with guard bits. */
export function viewBits(zoomLog2: number, minDimension: number): number {
  const pixelBits = Math.ceil(-log2PixelSpacing(zoomLog2, minDimension))
  return Math.max(GUARD_BITS, pixelBits + GUARD_BITS)
}

/** The pixel spacing split into a double mantissa and an integer exponent. */
export function pixelSpacing(
  zoomLog2: number,
  minDimension: number,
): { mantissa: number; exponent: number } {
  const log2 = log2PixelSpacing(zoomLog2, minDimension)
  const exponent = Math.floor(log2)
  return { mantissa: 2 ** (log2 - exponent), exponent }
}

interface FixedPoint {
  re: bigint
  im: bigint
  bits: number
}

function parseCenter(view: DeepZoomView, bits: number): FixedPoint {
  return {
    re: parseFixed(view.centerRe, bits) ?? 0n,
    im: parseFixed(view.centerIm, bits) ?? 0n,
    bits,
  }
}

function printCenter(
  point: FixedPoint,
  zoomLog2: number,
  minDimension: number,
): Pick<DeepZoomView, 'centerRe' | 'centerIm'> {
  const pixelBits = Math.max(0, -log2PixelSpacing(zoomLog2, minDimension))
  // Eight bits past a pixel: enough that a printed view re-renders identically.
  const places = decimalPlacesForBits(Math.ceil(pixelBits) + 8)
  return {
    centerRe: formatFixed(point.re, point.bits, places),
    centerIm: formatFixed(point.im, point.bits, places),
  }
}

/** Screen pixels (y down) to a fixed-point complex displacement. */
function screenToFixed(
  dx: number,
  dy: number,
  zoomLog2: number,
  minDimension: number,
  bits: number,
): { re: bigint; im: bigint } {
  const s = pixelSpacing(zoomLog2, minDimension)
  return {
    re: scaledNumberToFixed(dx * s.mantissa, s.exponent, bits),
    im: scaledNumberToFixed(-dy * s.mantissa, s.exponent, bits),
  }
}

/** Drag the picture by a pointer displacement: the plane follows the finger. */
export function panView(
  view: DeepZoomView,
  dx: number,
  dy: number,
  minDimension: number,
): DeepZoomView {
  const bits = viewBits(view.zoomLog2, minDimension)
  const center = parseCenter(view, bits)
  const d = screenToFixed(dx, dy, view.zoomLog2, minDimension, bits)
  const moved = { re: center.re - d.re, im: center.im - d.im, bits }
  return {
    ...printCenter(moved, view.zoomLog2, minDimension),
    zoomLog2: view.zoomLog2,
  }
}

/**
 * Zoom by `stepLog2` octaves keeping the point under the pointer fixed on
 * screen. `(dx, dy)` is the pointer's offset from the canvas centre.
 */
export function zoomViewAt(
  view: DeepZoomView,
  dx: number,
  dy: number,
  minDimension: number,
  stepLog2: number,
): DeepZoomView {
  const zoomLog2 = clampZoomLog2(view.zoomLog2 + stepLog2)
  const applied = zoomLog2 - view.zoomLog2
  const bits = viewBits(Math.max(view.zoomLog2, zoomLog2), minDimension)
  const center = parseCenter(view, bits)
  // The anchor stays put: centre moves by offset * (1 - newSpacing/oldSpacing).
  const keep = 1 - 2 ** -applied
  const d = screenToFixed(
    dx * keep,
    dy * keep,
    view.zoomLog2,
    minDimension,
    bits,
  )
  const moved = { re: center.re + d.re, im: center.im + d.im, bits }
  return { ...printCenter(moved, zoomLog2, minDimension), zoomLog2 }
}

/** The complex point under a screen pixel, as decimal strings. */
export function pointAt(
  view: DeepZoomView,
  dx: number,
  dy: number,
  minDimension: number,
): { re: string; im: string } {
  const bits = viewBits(view.zoomLog2, minDimension)
  const center = parseCenter(view, bits)
  const d = screenToFixed(dx, dy, view.zoomLog2, minDimension, bits)
  const printed = printCenter(
    { re: center.re + d.re, im: center.im + d.im, bits },
    view.zoomLog2,
    minDimension,
  )
  return { re: printed.centerRe, im: printed.centerIm }
}

/**
 * Where the view centre sits relative to a reference point, in pixels
 * (x right, y UP — the plane's orientation, which is what the shader wants).
 * Exact at any depth: the subtraction happens in fixed point and only the
 * small difference is rounded to a double.
 */
export function centerOffsetPixels(
  view: DeepZoomView,
  reference: { re: string; im: string },
  minDimension: number,
): { x: number; y: number } {
  const bits = viewBits(view.zoomLog2, minDimension)
  const center = parseCenter(view, bits)
  const refRe = parseFixed(reference.re, bits) ?? 0n
  const refIm = parseFixed(reference.im, bits) ?? 0n
  const log2Spacing = log2PixelSpacing(view.zoomLog2, minDimension)
  const toPixels = (v: bigint): number => {
    // Past 1e308, 2^(exponent - log2Spacing) alone is Infinity: 0 * it is NaN.
    if (v === 0n) return 0
    const s = fixedToScaledNumber(v, bits)
    return s.mantissa * 2 ** (s.exponent - log2Spacing)
  }
  return { x: toPixels(center.re - refRe), y: toPixels(center.im - refIm) }
}

/** Is this a view a person could have typed? Used to vet URL and paste input. */
export function isValidView(view: DeepZoomView): boolean {
  return (
    parseFixed(view.centerRe, 8) !== undefined &&
    parseFixed(view.centerIm, 8) !== undefined &&
    Number.isFinite(view.zoomLog2)
  )
}

/** "1.2e34"-style magnification for a readout. */
export function formatMagnification(zoomLog2: number): string {
  const log10 = zoomLog2 * LOG10_2
  if (log10 < 4) {
    const value = 2 ** zoomLog2
    return value.toFixed(value < 9.995 ? 2 : value < 99.95 ? 1 : 0)
  }
  const exponent = Math.floor(log10)
  const mantissa = 10 ** (log10 - exponent)
  return `${mantissa.toFixed(2)}e${exponent}`
}
