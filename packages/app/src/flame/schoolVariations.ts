/**
 * The variation lists behind the Arena schools, and the type a variation is
 * read as: what the renderer draws, so a 3D flame's 2D names count as their
 * 3D analogs. `classifySchool` and `calculateGroundedStats` (stats.ts) read
 * them in the order Order, Crystal, Vortex, Void, Tide.
 */

import { resolveVariationType3D, VARIATION_2D_TO_3D_MAP, } from './transformFunction3D'
import { isVariationTypeFor } from './variationRegistry'

/*
 * The lists are keyed by registered variation TYPE, and are read with
 * `drawnType()`: a variation's key in `transform.variations` is its id (a
 * generated UUID in the editor, a descriptive name in the examples), which
 * never matches a type name. A type sits on one list only: the checks run in
 * order, so a second listing never counts. Each list also holds the 3D analog
 * of its 2D entries: from the live rows of the renderer's 2D-to-3D map, since
 * a 3D flame draws bubbleVar as bubble3D, and by hand for the 3D registry's
 * name twins the map leaves out (waves3D for wavesVar). stats.test.ts checks
 * both kinds.
 */
const LIVE_2D_TO_3D = Object.entries(VARIATION_2D_TO_3D_MAP).filter(
  ([from, to]) => isVariationTypeFor(2, from) && isVariationTypeFor(3, to),
)

function school(types: readonly string[]): ReadonlySet<string> {
  const list = new Set(types)
  for (const [from, to] of LIVE_2D_TO_3D) if (list.has(from)) list.add(to)
  return list
}

export const LINEAR_VARIATIONS = school(['linearVar', 'linearTVar', 'linear3D'])

export const SYMMETRY_VARIATIONS = school([
  'juliaVar',
  'juliaNVar',
  'juliaScopeVar',
  'kaleidoscopeVar',
  'ngonVar',
  'archVar',
  'cylinderVar',
  'cylinder2Var',
  'cylinderApoVar',
  'polarVar',
  'polar2Var',
  'nPolarVar',
  'symBandG1Var',
  'symBandG2Var',
  'symBandG3Var',
  'symBandG4Var',
  'symBandG5Var',
  'symBandG6Var',
  'symBandG7Var',
  'symNetG1Var',
  'symNetG2Var',
  'symNetG3Var',
  'symNetG4Var',
  'symNetG5Var',
  'symNetG6Var',
  'symNetG7Var',
  'symNetG8Var',
  'symNetG9Var',
  'symNetG10Var',
  'symNetG11Var',
  'symNetG12Var',
  'symNetG13Var',
  'symNetG14Var',
  'symNetG15Var',
  'symNetG16Var',
  'symNetG17Var',
  'postMirrorWfVar',
  'postAxisSymmetryWfVar',
  'postPointSymmetryWfVar',
  'julia3D',
  'polar3D',
  'hemisphere3D',
])

export const VORTEX_VARIATIONS = school([
  'swirlVar',
  'spiralVar',
  'curlVar',
  'swirl3D',
  'spiral3D',
])

export const VOID_VARIATIONS = school([
  'sphericalVar',
  'bubbleVar',
  'eyefishVar',
  'inversionVar',
  'hyperbolicVar',
  'popcornVar',
  'spherical3D',
  'sphere3D',
  'eyefish3D',
  'popcorn3D',
])

export const TIDE_VARIATIONS = school([
  'sinusoidalVar',
  'wavesVar',
  'blurVar',
  'gaussianBlurVar',
  'radialBlurVar',
  'rippleVar',
  'sinusoidal3D',
  'waves3D',
])

/**
 * The type a variation is drawn as, or '' when it has none. A 3D flame draws
 * as the 3D renderer resolves the type (a mapped 2D name as its 3D analog); a
 * name it cannot resolve stays as written and counts as unknown. The stats
 * read agent-supplied flames unvalidated (`arena_get_stats`), so a malformed
 * variation counts as an unknown type rather than throwing.
 */
export function drawnType(
  variation: { type?: unknown },
  spaceDim: 2 | 3,
): string {
  const type = typeof variation.type === 'string' ? variation.type : ''
  return spaceDim === 3 ? (resolveVariationType3D(type) ?? type) : type
}
