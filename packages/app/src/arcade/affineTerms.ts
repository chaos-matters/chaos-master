/**
 * The terms of an affine in each key layout, what each one is, and which
 * layout the renderer reads a given affine in. The animatable catalog names
 * every affine term with these, and the Cinema tools give agents the
 * equations.
 */

export type AffineLayout = '2D' | '3D'

/**
 * Every term of an affine in each key layout, in key order, and what it is.
 *
 * 2D `{ a b c / d e f }`: x' = a x + b y + c, y' = d x + e y + f.
 * 3D `{ a b c d / e f g h / i j k l }`: x' = a x + b y + c z + d,
 * y' = e x + f y + g z + h, z' = i x + j y + k z + l.
 * The same letter is a different term in each: `d` is y-from-x in 2D and the
 * x translation in 3D.
 */
export const AFFINE_TERMS: Record<AffineLayout, Record<string, string>> = {
  '2D': {
    a: 'x from x',
    b: 'x from y',
    c: 'x translation',
    d: 'y from x',
    e: 'y from y',
    f: 'y translation',
  },
  '3D': {
    a: 'x from x',
    b: 'x from y',
    c: 'x from z',
    d: 'x translation',
    e: 'y from x',
    f: 'y from y',
    g: 'y from z',
    h: 'y translation',
    i: 'z from x',
    j: 'z from y',
    k: 'z from z',
    l: 'z translation',
  },
}

/**
 * What each term is, as the equation it appears in: the constant term of each
 * row is its translation. Tested against the renderer, as `AFFINE_TERMS` is.
 */
export const AFFINE_EQUATIONS: Record<AffineLayout, string> = {
  '2D': "{a-f}: x'=ax+by+c, y'=dx+ey+f",
  '3D': "{a-l}: x'=ax+by+cz+d, y'=ex+fy+gz+h, z'=ix+jy+kz+l",
}

/**
 * The key layout the renderer reads an affine in. The 2D renderer reads a-f
 * in the 2D layout and ignores g-l, so on a flame that is not 3D every affine
 * is 2D. The 3D renderer reads each affine in its own layout
 * (`isAffine3D` in flame/transformFunction3D.ts: any of `g`-`l` present), and
 * a 3D flame can hold 2D-layout affines, which it maps.
 */
export function affineLayoutOf(
  affine: Record<string, unknown> | undefined,
  dimensions: number | undefined,
): AffineLayout {
  if (!affine || dimensions !== 3) return '2D'
  return ['g', 'h', 'i', 'j', 'k', 'l'].some((key) => affine[key] !== undefined)
    ? '3D'
    : '2D'
}
