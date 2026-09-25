/**
 * What of a flame's transforms its compiled IFS shader bakes in: each
 * transform's id (a uniform struct member name), each variation's id and
 * type, and whether the transform is a Flame Clash 2D fighter's, which
 * decides the function each type compiles to in 3D (resolveVariationType3D).
 * Probabilities, weights, affines and colours reach the shader through
 * uniform buffers and are left out, so a change to them never recompiles.
 *
 * The IFS pipelines key their shader cache on this and Flam3 rebuilds its
 * pipeline when it changes, so all of them read it from here. Beside it, a
 * Flame Clash flame adds its team partition (clashTeamsSignature), and each of
 * them adds the custom variations' version: editing a custom variation keeps
 * its type and changes its code.
 */
import { recordEntries } from '@/utils/record'
import type { TransformRecord } from './schema/flameSchema'

export function shaderShapeOf(transforms: TransformRecord) {
  return recordEntries(transforms).map(([tid, transform]) => ({
    tid,
    ...(transform.from2D ? { from2D: true } : {}),
    variations: recordEntries(transform.variations).map(([vid, v]) => ({
      vid,
      type: v.type,
    })),
  }))
}
