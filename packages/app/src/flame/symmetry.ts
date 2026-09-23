import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { defaultLinearType } from '@/flame/variationRegistry'
import { deepClone } from '@/utils/clone'
import type { FlameDescriptor, TransformId } from '@/flame/schema/flameSchema'

/**
 * Applies n-fold rotational or dihedral symmetry to a FlameDescriptor
 * by generating auxiliary symmetry transforms prefixed with `_sym__`.
 * Passing folds <= 1 strips existing symmetry transforms.
 */
export function applySymmetryToFlame(
  flame: FlameDescriptor,
  folds: number,
  type: 'rotational' | 'dihedral' = 'rotational',
): FlameDescriptor {
  const draft = deepClone(flame)
  if (!draft.transforms) draft.transforms = {}

  // Remove any existing symmetry transforms
  for (const tid of Object.keys(draft.transforms)) {
    if (tid.startsWith('_sym__')) {
      delete draft.transforms[tid as TransformId]
    }
  }

  if (folds <= 1) {
    return draft
  }

  const baseTransforms = Object.values(draft.transforms)
  const totalWeight = baseTransforms.reduce(
    (total, t) => total + (t.probability ?? 1),
    0,
  )
  const symWeight = Math.max(totalWeight, 1)
  const identity = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  const is3D = draft.renderSettings?.dimensions === 3
  // The registry's own name, as flame.applySymmetry uses: the 2D linear is
  // 'linearVar'. A bare 'linear' is not registered, so createFlameWgsl
  // skipped it and every symmetry transform sent its points to the origin.
  const linearVarType = defaultLinearType(is3D ? 3 : 2)

  for (let i = 1; i < folds; i++) {
    const angle = (2 * Math.PI * i) / folds
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const symId = generateTransformId('sym')
    const vid = generateVariationId()

    const preAffine = is3D
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

    draft.transforms[symId] = {
      probability: symWeight,
      colorSpeed: 0,
      color: { x: 0, y: 0 },
      visible: true,
      preAffine,
      postAffine: identity,
      variations: {
        [vid]: { type: linearVarType, weight: 1, visible: true },
      },
    }
  }

  if (type === 'dihedral') {
    const symId = generateTransformId('sym')
    const vid = generateVariationId()
    const preAffine = is3D
      ? {
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
        }
      : { a: -1, b: 0, c: 0, d: 0, e: 1, f: 0 }

    draft.transforms[symId] = {
      probability: symWeight,
      colorSpeed: 0,
      color: { x: 0, y: 0 },
      visible: true,
      preAffine,
      postAffine: identity,
      variations: {
        [vid]: { type: linearVarType, weight: 1, visible: true },
      },
    }
  }

  return draft
}
