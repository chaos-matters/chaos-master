/**
 * Reads back which symmetry a flame's generated `_sym__` transforms make, so
 * the Symmetry card can show the type and fold count and rebuild the set when
 * one of them changes.
 *
 * The mirror is how a dihedral set is told from a rotational one. It is kept
 * separate from `symmetry.ts`, which writes the transforms, so both can be
 * tested against each other.
 */
import type { TransformFunction } from '@/flame/schema/flameSchema'

export type SymmetryType = 'rotational' | 'dihedral'

type AffineLike = Readonly<Record<string, number | undefined>>

/** Which key layout an affine uses: `{ a b c / d e f }` or `{ a b c d / e f g h / i j k l }`. */
export type AffineLayout = '2D' | '3D'

/**
 * True when a preAffine uses the 3D key layout. The same test the 3D renderer
 * makes (`isAffine3D` in transformFunction3D.ts): any of `g`-`l` present.
 */
function has3DLayout(affine: AffineLike): boolean {
  return (
    affine.g !== undefined ||
    affine.h !== undefined ||
    affine.i !== undefined ||
    affine.j !== undefined ||
    affine.k !== undefined ||
    affine.l !== undefined
  )
}

/**
 * True when a preAffine is the mirror of a dihedral symmetry set, x -> -x, in
 * either key layout. Only the linear part is compared; the translation is not,
 * as before.
 *
 * - 2D layout `{ a b c / d e f }`, c and f the translation: `a -1, b 0, d 0,
 *   e 1`. Both writers (`symmetry.ts` and the `flame.applySymmetry` command,
 *   which builds its transforms there) write this for a 2D flame.
 * - 3D layout `{ a b c d / e f g h / i j k l }`, d, h and l the translation:
 *   `a -1, b 0, c 0, e 0, f 1, g 0, i 0, j 0, k 1`. Both writers write this
 *   for a 3D flame. Loading a 3D flame also turns a 2D-layout mirror into it
 *   (`migrateAffine2Dto3D` in core), so a 3D flame saved before the writers
 *   became one still reads back as dihedral.
 */
export function isSymmetryMirror(affine: AffineLike | undefined): boolean {
  if (!affine) return false
  if (has3DLayout(affine)) {
    return (
      affine.a === -1 &&
      affine.b === 0 &&
      affine.c === 0 &&
      affine.e === 0 &&
      affine.f === 1 &&
      affine.g === 0 &&
      affine.i === 0 &&
      affine.j === 0 &&
      affine.k === 1
    )
  }
  return affine.a === -1 && affine.b === 0 && affine.d === 0 && affine.e === 1
}

type SymTransform = Pick<TransformFunction, 'preAffine'> | undefined

/** Dihedral when any of the generated transforms is the mirror. */
export function detectSymmetryType(
  symTransforms: readonly SymTransform[],
): SymmetryType {
  return symTransforms.some((t) => isSymmetryMirror(t?.preAffine))
    ? 'dihedral'
    : 'rotational'
}

/**
 * The fold count n the generated transforms stand for: n - 1 rotations, plus
 * the mirror for a dihedral set. With no transforms it is 1.
 */
export function detectSymmetryFolds(
  symTransforms: readonly SymTransform[],
): number {
  return detectSymmetryType(symTransforms) === 'dihedral'
    ? symTransforms.length
    : symTransforms.length + 1
}

/** The key layout of an affine, decided as `has3DLayout` decides it. */
export function affineLayout(affine: AffineLike): AffineLayout {
  return has3DLayout(affine) ? '3D' : '2D'
}

/**
 * The angle the Symmetry card shows for one rotation transform, in
 * [0, 2 pi): the rotation about z, read from the terms its layout keeps
 * `cos` and `sin` in. 2D: `a = cos`, `d = sin`. 3D: `a = cos`, `e = sin`.
 */
export function symmetryRotationAngle(
  affine: AffineLike,
  layout: AffineLayout = affineLayout(affine),
): number {
  const sin = layout === '3D' ? affine.e : affine.d
  let angle = Math.atan2(sin ?? 0, affine.a ?? 1)
  if (angle < 0) angle += 2 * Math.PI
  return angle
}

/**
 * The preAffine terms a rotation about z sets, which the card's angle editor
 * keys: `a b d e` in the 2D layout, `a b e f` in the 3D layout.
 */
export function symmetryRotationTerms(
  affine: AffineLike,
  layout: AffineLayout = affineLayout(affine),
): readonly string[] {
  return layout === '3D' ? ['a', 'b', 'e', 'f'] : ['a', 'b', 'd', 'e']
}

/**
 * The layout the Symmetry card's angle editor reads, keys and writes a
 * rotation in: the one the renderer reads that preAffine in. The 2D renderer
 * reads a-f in the 2D layout and ignores g-l, so a 2D flame is always 2D (a
 * 12-key rotation there is one only an agent can write). The 3D renderer
 * reads each affine in its own layout.
 */
export function symmetryEditLayout(
  affine: AffineLike,
  dimensions: number | undefined,
): AffineLayout {
  return dimensions === 3 ? affineLayout(affine) : '2D'
}
