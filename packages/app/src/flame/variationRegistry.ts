import { transformVariations, variationTypes } from './variations'
import { transformVariations3D, variationTypes3D } from './variations3D'
import type { TransformVariationType } from './variations'
import type { VariationCategory } from './variations/categories'
import type { TransformVariationType3D } from './variations3D'

export type Dims = 2 | 3
export type AnyVariationType = TransformVariationType | TransformVariationType3D

/**
 * Returns the appropriate variation registry for the given dimension.
 */
export function getVariationRegistry(dims: Dims) {
  return dims === 3 ? transformVariations3D : transformVariations
}

/**
 * Returns the list of variation type keys for the given dimension.
 */
export function variationTypesFor(
  dims: Dims,
): readonly TransformVariationType[] | readonly TransformVariationType3D[] {
  return dims === 3 ? variationTypes3D : variationTypes
}

/**
 * Checks if a type string belongs to the registry for the given dimension.
 */
export function isVariationTypeFor(dims: Dims, t: string): boolean {
  const reg = getVariationRegistry(dims)
  return t in reg
}

/**
 * Returns the category for a variation type in the given dimension's registry.
 */
export function categoryOf(
  dims: Dims,
  type: AnyVariationType,
): VariationCategory | undefined {
  if (dims === 3) {
    const entry = transformVariations3D[type as TransformVariationType3D]
    return entry?.category
  }
  const entry = transformVariations[type]
  return entry?.category
}

/**
 * Returns the default linear variation type for the given dimension.
 */
export function defaultLinearType(dims: Dims): AnyVariationType {
  return dims === 3 ? 'linear3D' : 'linearVar'
}
