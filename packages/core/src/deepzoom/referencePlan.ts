/**
 * When a reference orbit can be reused, and how an old picture maps into a
 * new view. Pure decisions, kept apart from the GPU code that acts on them.
 *
 * A reference serves a view while four things hold: it is the same fractal,
 * it was iterated with enough bits for the view's pixel size, it is long
 * enough for the iteration limit, and the view centre is close enough to it
 * that every pixel's offset still fits f32 with sub-pixel accuracy and, for
 * the Mandelbrot set, inside the radius its BLA table was built for. A Julia
 * table has no such radius: with no `+ dc` term its radii bound the delta
 * alone, which the shader checks per pixel. Rebasing makes *any* reference
 * correct, so these are about accuracy and speed, never about glitches.
 *
 * A reference that no longer serves can still *stand in* while the next is
 * computed, so a deep zoom keeps sharpening instead of waiting on the
 * worker: with half the guard bits, and without its BLA table once a
 * Mandelbrot view has zoomed out past the table's radius.
 */
import { centerOffsetPixels, GUARD_BITS, log2PixelSpacing, viewBits, } from './deepZoomView'
import type { DeepZoomView } from './deepZoomView'
import type { ComplexString } from './explorerUrl'
import type { FractalKind } from './referenceOrbit'

export interface ExplorerTarget {
  readonly kind: FractalKind
  readonly view: DeepZoomView
  readonly juliaC: ComplexString
  readonly maxIterations: number
  /** Render grid, in pixels. */
  readonly width: number
  readonly height: number
}

export interface ReferenceSpec {
  readonly kind: FractalKind
  readonly reference: ComplexString
  readonly juliaC: ComplexString
  readonly bits: number
  readonly maxIterations: number
  /** Mandelbrot only: log2 of the largest |dc| its BLA table is valid for. */
  readonly cMaxLog2: number
}

export interface ReferenceState extends ReferenceSpec {
  /** Every orbit escaped before the limit, so a higher limit needs no redo. */
  readonly complete: boolean
}

/**
 * Pixels between the view centre and the reference before a new one is
 * computed: an f32 offset of 2^10 px is exact to 2^-14 px.
 */
export const REFERENCE_OFFSET_LIMIT = 1024

/** Octaves of zoom a reference's precision allows before it is redone. */
const PRECISION_HEADROOM_OCTAVES = 8

/** Octaves of zoom-out a BLA table allows before it is rebuilt. */
const RADIUS_HEADROOM_LOG2 = 2

/**
 * Bits below the pixel size a stand-in's precision must still reach: half
 * of `GUARD_BITS`. The perturbation tests check exact agreement at this.
 */
export const STAND_IN_GUARD_BITS = 32

function minDimension(t: ExplorerTarget): number {
  return Math.max(1, Math.min(t.width, t.height))
}

/** log2 of the largest |dc| a pixel can have while this reference serves. */
function reachLog2(t: ExplorerTarget): number {
  const halfDiagonal = Math.hypot(t.width, t.height) / 2
  return (
    log2PixelSpacing(t.view.zoomLog2, minDimension(t)) +
    Math.log2(halfDiagonal + REFERENCE_OFFSET_LIMIT)
  )
}

export function referenceSpecFor(t: ExplorerTarget): ReferenceSpec {
  return {
    kind: t.kind,
    reference: { re: t.view.centerRe, im: t.view.centerIm },
    juliaC: t.juliaC,
    bits: viewBits(
      t.view.zoomLog2 + PRECISION_HEADROOM_OCTAVES,
      minDimension(t),
    ),
    maxIterations: t.maxIterations,
    cMaxLog2: reachLog2(t) + RADIUS_HEADROOM_LOG2,
  }
}

function sameC(a: ComplexString, b: ComplexString): boolean {
  return a.re === b.re && a.im === b.im
}

/** View centre minus reference, in pixels, y up. */
export function referenceOffset(
  ref: ReferenceSpec,
  t: ExplorerTarget,
): { x: number; y: number } {
  return centerOffsetPixels(t.view, ref.reference, minDimension(t))
}

/**
 * Whether `ref` can keep rendering `t`, serving or not, and whether with its
 * BLA table. Past a Mandelbrot table's radius every step is taken singly,
 * which only costs speed; a Julia table is never outgrown. Never across
 * fractals or Julia constants, for a limit the reference was not iterated
 * to, or for a pan past the offset limit.
 */
export function standIn(
  ref: ReferenceState,
  t: ExplorerTarget,
): { useBla: boolean } | undefined {
  if (ref.kind !== t.kind) return undefined
  if (t.kind === 'julia' && !sameC(ref.juliaC, t.juliaC)) return undefined
  const slack = GUARD_BITS - STAND_IN_GUARD_BITS
  if (viewBits(t.view.zoomLog2, minDimension(t)) - slack > ref.bits)
    return undefined
  if (t.maxIterations > ref.maxIterations && !ref.complete) return undefined
  const offset = referenceOffset(ref, t)
  if (Math.hypot(offset.x, offset.y) > REFERENCE_OFFSET_LIMIT) return undefined
  return { useBla: t.kind === 'julia' || reachLog2(t) <= ref.cMaxLog2 }
}

export function referenceServes(
  ref: ReferenceState,
  t: ExplorerTarget,
): boolean {
  return (
    standIn(ref, t)?.useBla === true &&
    viewBits(t.view.zoomLog2, minDimension(t)) <= ref.bits
  )
}

/**
 * Where a pixel of `next` finds itself in `previous`'s picture: previous
 * pixel = next pixel * scale + offset, both centred with y up. Undefined when
 * the old picture shows a different fractal, or is too far away to matter.
 */
export function backdropMapping(
  previous: ExplorerTarget,
  next: ExplorerTarget,
): { scale: number; offset: { x: number; y: number } } | undefined {
  if (previous.kind !== next.kind) return undefined
  if (next.kind === 'julia' && !sameC(previous.juliaC, next.juliaC))
    return undefined
  const scale =
    2 ** (previous.view.zoomLog2 - next.view.zoomLog2) *
    (minDimension(previous) / minDimension(next))
  const shift = centerOffsetPixels(
    next.view,
    { re: previous.view.centerRe, im: previous.view.centerIm },
    minDimension(next),
  )
  const offset = { x: shift.x * scale, y: shift.y * scale }
  if (
    !Number.isFinite(offset.x) ||
    !Number.isFinite(offset.y) ||
    !Number.isFinite(scale)
  ) {
    return undefined
  }
  return { scale, offset }
}
