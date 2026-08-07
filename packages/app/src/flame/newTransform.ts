import { generateVariationId } from './transformFunction'
import { defaultLinearType } from './variationRegistry'
import { getVariationDefault } from './variations/utils'
import type { TransformFunction, VariationId } from './schema/flameSchema'
import type { Dims } from './variationRegistry'

/**
 * A blank transform: identity affines and one linear variation.
 *
 * Its own module rather than `transformFunction.ts` because it needs
 * `variations/utils`, which already imports `transformFunction` — the pairing
 * would be an import cycle.
 *
 * `variationId` is injectable so callers that must be reproducible (the
 * session recorder's commands, which mint ids in `normalizeArgs` and record
 * them) get the same id on replay. Omitted, it mints one, which is what the
 * interactive paths want.
 */
export function newDefaultTransform(
  dims: Dims = 2,
  variationId: VariationId = generateVariationId(),
): TransformFunction {
  const is3D = dims === 3
  const identity = is3D
    ? {
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
      }
    : { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  return {
    probability: 1,
    colorSpeed: 0.4,
    color: { x: 0, y: 0 },
    preAffine: identity,
    postAffine: identity,
    visible: true,
    variations: {
      [variationId]: getVariationDefault(defaultLinearType(dims), 1.0),
    },
  }
}
