/**
 * The explorer's location in the URL fragment, so a view can be bookmarked,
 * shared and reloaded exactly. A fragment never reaches the server, which
 * matters here: a centre at 1e300 is a kilobyte of digits.
 *
 *   #mandelbrot?re=-0.75&im=0&z=0.4&it=1000&p=<palette id>&cycle=64&shift=0&relief=0.5
 *   #julia?re=0&im=0&z=0&cre=-0.8&cim=0.156&it=1000&cycle=64&shift=0&relief=0.5
 *   #mandelbrot?re=-0.75&im=0&z=0.4&cre=-0.8&cim=0.156&jre=0&jim=0&jz=0&split=1&it=1000&cycle=64&shift=0&relief=0.5
 *
 * The colour settings travel with the place, so a link reopens the picture
 * Save PNG writes, not just its coordinates. Colour is applied after the
 * iteration, so they never make a link costlier to open.
 *
 * Parsing is forgiving: anything missing or malformed falls back to the
 * default for that field instead of rejecting the whole link.
 */
import { parseFixed } from './bigFixed'
import { clampZoomLog2, JULIA_HOME, MANDELBROT_HOME } from './deepZoomView'
import type { DeepZoomView } from './deepZoomView'
import type { FractalKind } from './referenceOrbit'

export interface ComplexString {
  readonly re: string
  readonly im: string
}

export interface ExplorerLocation {
  readonly kind: FractalKind
  readonly view: DeepZoomView
  /** The Julia constant. Kept for the Mandelbrot set too, to switch back to. */
  readonly juliaC: ComplexString
  readonly maxIterations: number
  readonly paletteId: string | undefined
  /**
   * Iterations per trip through the palette. The colour pass counts in
   * whole iterations, so a link keeps the rounded value.
   */
  readonly colourCycle: number
  /** Where in the palette the cycle starts, as a fraction of one trip. */
  readonly colourShift: number
  /** How strongly the escape field's slope lights the picture, 0 to 1. */
  readonly relief: number
  /**
   * The Mandelbrot set and the Julia set of `juliaC` side by side. `view` is
   * then the Mandelbrot pane's, `juliaView` the Julia pane's, and `kind` is
   * always 'mandelbrot'.
   */
  readonly split: boolean
  readonly juliaView: DeepZoomView
}

export const DEFAULT_JULIA_C: ComplexString = { re: '-0.8', im: '0.156' }
export const DEFAULT_MAX_ITERATIONS = 1000
export const MIN_ITERATIONS = 16
/**
 * A reference orbit costs 16 B per iteration on the GPU and a Julia view
 * holds two, so 4M keeps both inside the common 128 MiB binding limit; the
 * renderer lowers it further on a device with less.
 */
export const MAX_ITERATIONS = 4_000_000

/** The colour cycle slider's ends, 2^1 and 2^14 iterations. */
export const MIN_COLOUR_CYCLE = 2
export const MAX_COLOUR_CYCLE = 16_384
export const DEFAULT_COLOUR_CYCLE = 64
export const DEFAULT_COLOUR_SHIFT = 0
export const DEFAULT_RELIEF = 0.5

/** A centre at 1e1000 needs about 1 010 digits. */
const MAX_DECIMAL_LENGTH = 1200
/**
 * Both sets lie inside |z| <= 2, but a pan can wander out past the bailout
 * radius (256) and its link should still reopen it; four whole digits cost
 * nothing, a million cost every pan.
 */
const MAX_DECIMAL_MAGNITUDE = 1024

export function clampIterations(n: number): number {
  return Math.round(Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, n)))
}

export function homeView(kind: FractalKind): DeepZoomView {
  return kind === 'julia' ? JULIA_HOME : MANDELBROT_HOME
}

export const DEFAULT_LOCATION: ExplorerLocation = {
  kind: 'mandelbrot',
  view: MANDELBROT_HOME,
  juliaC: DEFAULT_JULIA_C,
  maxIterations: DEFAULT_MAX_ITERATIONS,
  paletteId: undefined,
  colourCycle: DEFAULT_COLOUR_CYCLE,
  colourShift: DEFAULT_COLOUR_SHIFT,
  relief: DEFAULT_RELIEF,
  split: false,
  juliaView: JULIA_HOME,
}

/**
 * A coordinate a person could have typed, or undefined: a decimal the
 * explorer can parse, no longer than the deepest view needs and no further
 * out than 1024, so a hostile link cannot make every pan cost a million-digit
 * multiplication. A leading '+' is dropped.
 */
export function explorerDecimal(
  text: string | null | undefined,
): string | undefined {
  if (text === null || text === undefined || text.length > MAX_DECIMAL_LENGTH) {
    return undefined
  }
  const trimmed = text.trim()
  if (!(Math.abs(Number(trimmed)) <= MAX_DECIMAL_MAGNITUDE)) return undefined
  if (parseFixed(trimmed, 8) === undefined) return undefined
  return trimmed.startsWith('+') ? trimmed.slice(1) : trimmed
}

function finite(text: string | null): number | undefined {
  if (text === null || text.trim() === '') return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/** A number from the link held to [min, max], or `fallback` if it is not one. */
function bounded(
  text: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = finite(text)
  return value === undefined ? fallback : Math.min(max, Math.max(min, value))
}

/**
 * Four decimals: finer than a wheel notch of zoom or a step of any colour
 * slider, and short in a link.
 */
function fourDecimals(value: number): string {
  return String(Math.round(value * 1e4) / 1e4)
}

/** A view from three parameters, each falling back to `home` on its own. */
function parseView(
  params: URLSearchParams,
  keys: readonly [re: string, im: string, zoom: string],
  home: DeepZoomView,
): DeepZoomView {
  const zoom = finite(params.get(keys[2]))
  return {
    centerRe: explorerDecimal(params.get(keys[0])) ?? home.centerRe,
    centerIm: explorerDecimal(params.get(keys[1])) ?? home.centerIm,
    zoomLog2: zoom === undefined ? home.zoomLog2 : clampZoomLog2(zoom),
  }
}

function setView(
  params: URLSearchParams,
  keys: readonly [re: string, im: string, zoom: string],
  view: DeepZoomView,
): void {
  params.set(keys[0], view.centerRe)
  params.set(keys[1], view.centerIm)
  params.set(keys[2], fourDecimals(view.zoomLog2))
}

const VIEW_KEYS = ['re', 'im', 'z'] as const
const JULIA_VIEW_KEYS = ['jre', 'jim', 'jz'] as const

export function parseExplorerHash(hash: string): ExplorerLocation {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  const q = body.indexOf('?')
  const head = q < 0 ? body : body.slice(0, q)
  const params = new URLSearchParams(q < 0 ? '' : body.slice(q + 1))
  const split = params.get('split') === '1'
  const kind: FractalKind = head === 'julia' && !split ? 'julia' : 'mandelbrot'
  const iterations = finite(params.get('it'))
  const palette = params.get('p')
  return {
    kind,
    view: parseView(params, VIEW_KEYS, homeView(kind)),
    juliaC: {
      re: explorerDecimal(params.get('cre')) ?? DEFAULT_JULIA_C.re,
      im: explorerDecimal(params.get('cim')) ?? DEFAULT_JULIA_C.im,
    },
    maxIterations:
      iterations === undefined
        ? DEFAULT_MAX_ITERATIONS
        : clampIterations(iterations),
    paletteId:
      palette !== null && /^[\w-]{1,64}$/.test(palette) ? palette : undefined,
    colourCycle: Math.round(
      bounded(
        params.get('cycle'),
        MIN_COLOUR_CYCLE,
        MAX_COLOUR_CYCLE,
        DEFAULT_COLOUR_CYCLE,
      ),
    ),
    colourShift: bounded(params.get('shift'), 0, 1, DEFAULT_COLOUR_SHIFT),
    relief: bounded(params.get('relief'), 0, 1, DEFAULT_RELIEF),
    split,
    juliaView: parseView(params, JULIA_VIEW_KEYS, JULIA_HOME),
  }
}

export function formatExplorerHash(location: ExplorerLocation): string {
  const params = new URLSearchParams()
  const kind = location.split ? 'mandelbrot' : location.kind
  setView(params, VIEW_KEYS, location.view)
  if (kind === 'julia' || location.split) {
    params.set('cre', location.juliaC.re)
    params.set('cim', location.juliaC.im)
  }
  if (location.split) {
    setView(params, JULIA_VIEW_KEYS, location.juliaView)
    params.set('split', '1')
  }
  params.set('it', String(location.maxIterations))
  if (location.paletteId !== undefined) params.set('p', location.paletteId)
  // Written even at their defaults, so a link keeps its look if a default
  // ever changes.
  params.set('cycle', String(Math.round(location.colourCycle)))
  params.set('shift', fourDecimals(location.colourShift))
  params.set('relief', fourDecimals(location.relief))
  return `#${kind}?${params.toString()}`
}
