import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { defaultLinearType } from '@/flame/variationRegistry'
import { deepClone } from '@/utils/clone'
import type { AffineLayout, SymmetryType } from './symmetryDetection'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from '@/flame/schema/flameSchema'

/*
 * The one writer of generated symmetry transforms. `applySymmetryToFlame`
 * (Flame Clash's C1-C8 buttons) and the `flame.applySymmetry` command (the
 * Symmetry card, and agents) both build their transforms here, so the two
 * write the same thing: the flame's own key layout (3D for a 3D flame, as
 * loading a saved 3D flame would leave it), n - 1 rotations about z by
 * 2 pi i / n, and for a dihedral set the x mirror after them.
 */

/** An affine in either key layout: a-f, and g-l in the 3D layout. */
type AffineTerms = TransformFunction['preAffine']

const IDENTITY: Record<AffineLayout, AffineTerms> = {
  '2D': { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
  '3D': {
    a: 1,
    b: 0,
    c: 0,
    d: 0,
    e: 0,
    f: 1,
    g: 0,
    h: 0,
    i: 0,
    j: 0,
    k: 1,
    l: 0,
  },
}

const MIRROR: Record<AffineLayout, AffineTerms> = {
  '2D': { a: -1, b: 0, c: 0, d: 0, e: 1, f: 0 },
  '3D': {
    a: -1,
    b: 0,
    c: 0,
    d: 0,
    e: 0,
    f: 1,
    g: 0,
    h: 0,
    i: 0,
    j: 0,
    k: 1,
    l: 0,
  },
}

/** The key layout a flame's generated transforms are written in. */
export function symmetryLayout(flame: FlameDescriptor): AffineLayout {
  return flame.renderSettings?.dimensions === 3 ? '3D' : '2D'
}

/**
 * The preAffines of an n-fold set, in order: the rotations by 2 pi i / n for
 * i = 1 .. n - 1, then for a dihedral set the x mirror. A 1-fold dihedral set
 * is the mirror alone (the group D1, one mirror line); a 1-fold rotational
 * set, or any count below 1, is nothing.
 */
export function symmetryPreAffines(
  folds: number,
  type: SymmetryType,
  layout: AffineLayout,
): AffineTerms[] {
  const affines: AffineTerms[] = []
  for (let i = 1; i < folds; i++) {
    affines.push(symmetryRotationPreAffine((2 * Math.PI * i) / folds, layout))
  }
  if (type === 'dihedral' && folds >= 1) affines.push({ ...MIRROR[layout] })
  return affines
}

/**
 * The probability every generated transform gets: the flame's other
 * transforms' total, at least 1.
 */
export function symmetryWeight(
  transforms: FlameDescriptor['transforms'],
): number {
  const total = Object.entries(transforms)
    .filter(([tid]) => !tid.startsWith('_sym__'))
    .reduce((sum, [, t]) => sum + (t.probability ?? 1), 0)
  return Math.max(total, 1)
}

/** One generated symmetry transform around `preAffine`. */
export function symmetryTransform(
  preAffine: AffineTerms,
  weight: number,
  layout: AffineLayout,
  variationId: VariationId,
): TransformFunction {
  // The registry's own name: the 2D linear is 'linearVar'. A bare 'linear' is
  // not registered, so createFlameWgsl skipped it and every symmetry
  // transform sent its points to the origin.
  const linear = defaultLinearType(layout === '3D' ? 3 : 2)
  return {
    probability: weight,
    colorSpeed: 0,
    color: { x: 0, y: 0 },
    visible: true,
    preAffine,
    postAffine: { ...IDENTITY[layout] },
    variations: {
      [variationId]: { type: linear, weight: 1, visible: true },
    },
  }
}

/**
 * Applies n-fold rotational or dihedral symmetry to a FlameDescriptor by
 * replacing its `_sym__` transforms with a freshly generated set.
 */
export function applySymmetryToFlame(
  flame: FlameDescriptor,
  folds: number,
  type: SymmetryType = 'rotational',
): FlameDescriptor {
  const draft = deepClone(flame)
  if (!draft.transforms) draft.transforms = {}

  for (const tid of Object.keys(draft.transforms)) {
    if (tid.startsWith('_sym__')) {
      delete draft.transforms[tid as TransformId]
    }
  }

  const layout = symmetryLayout(draft)
  const weight = symmetryWeight(draft.transforms)
  for (const preAffine of symmetryPreAffines(folds, type, layout)) {
    draft.transforms[generateTransformId('sym')] = symmetryTransform(
      preAffine,
      weight,
      layout,
      generateVariationId(),
    )
  }
  return draft
}

/**
 * A rotation by `angle` about the z axis (the origin in 2D), with no
 * translation, in the given key layout. The Symmetry card's angle editor
 * writes it in the layout the transform already has.
 */
export function symmetryRotationPreAffine(
  angle: number,
  layout: AffineLayout,
): AffineTerms {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return layout === '3D'
    ? {
        a: cos,
        b: -sin,
        c: 0,
        d: 0,
        e: sin,
        f: cos,
        g: 0,
        h: 0,
        i: 0,
        j: 0,
        k: 1,
        l: 0,
      }
    : { a: cos, b: -sin, c: 0, d: sin, e: cos, f: 0 }
}
