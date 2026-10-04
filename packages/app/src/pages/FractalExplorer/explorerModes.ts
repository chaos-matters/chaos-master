/**
 * The explorer's modes, as pure functions of its location: which fractal is
 * shown or whether the Julia set sits beside the Mandelbrot set, and the two
 * view actions whose meaning depends on that, c from the view centre and
 * going home. The page applies what they return.
 */
import { centerOffsetPixels, homeView, JULIA_HOME, MANDELBROT_HOME, } from '@chaos-master/core'
import type { ComplexString, DeepZoomView, ExplorerLocation, FractalKind, } from '@chaos-master/core'

const { abs } = Math

/** One fractal, or the Mandelbrot set beside the Julia set of a point. */
export type ExplorerMode = FractalKind | 'split'

export function explorerMode(location: ExplorerLocation): ExplorerMode {
  return location.split ? 'split' : location.kind
}

/**
 * Is the point well inside the square every pane shows around its centre?
 * The nominal 1000 px cancels out: the test is in units of the smaller pane
 * dimension, and exact at any depth.
 */
function showsPoint(view: DeepZoomView, point: ComplexString): boolean {
  const offset = centerOffsetPixels(view, point, 1000)
  return abs(offset.x) < 400 && abs(offset.y) < 400
}

function viewCentre(view: DeepZoomView): ComplexString {
  return { re: view.centerRe, im: view.centerIm }
}

/** The location shown in `next` mode; the mode it is in already is itself. */
export function withMode(
  l: ExplorerLocation,
  next: ExplorerMode,
): ExplorerLocation {
  if (next === explorerMode(l)) return l
  if (next === 'split') {
    return l.kind === 'julia'
      ? {
          ...l,
          split: true,
          kind: 'mandelbrot',
          view: MANDELBROT_HOME,
          juliaView: l.view,
        }
      : {
          ...l,
          split: true,
          juliaView: JULIA_HOME,
          // Keep c while it is on screen, or start from the middle.
          juliaC: showsPoint(l.view, l.juliaC) ? l.juliaC : viewCentre(l.view),
        }
  }
  if (l.split) {
    // Leaving the split keeps the pane asked for, just as it was.
    return next === 'julia'
      ? { ...l, split: false, kind: 'julia', view: l.juliaView }
      : { ...l, split: false }
  }
  return { ...l, kind: next, view: homeView(next) }
}

/** c from the view centre: the Julia set there, or the split's point. */
export function withJuliaFromCentre(l: ExplorerLocation): ExplorerLocation {
  const juliaC = viewCentre(l.view)
  return l.split
    ? { ...l, juliaC }
    : { ...l, kind: 'julia', juliaC, view: JULIA_HOME }
}

/** Every pane back to its fractal's home view. */
export function withHome(l: ExplorerLocation): ExplorerLocation {
  return l.split
    ? { ...l, view: MANDELBROT_HOME, juliaView: JULIA_HOME }
    : { ...l, view: homeView(l.kind) }
}
