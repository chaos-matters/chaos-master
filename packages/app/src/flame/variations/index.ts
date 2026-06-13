import * as v from '@/valibot'
import { isParametricVariationType3D, transformVariations3D, variationTypes3D, } from '../variations3D'
import { parametricVariations } from './parametric'
import * as simpleVariations from './simple'
import type { TransformVariationType3D } from '../variations3D'

const rawVariations = [
  ...Object.values(simpleVariations),
  ...Object.values(parametricVariations),
]

export type TransformVariationType =
  | (typeof rawVariations)[number]['DescriptorSchema']['entries']['type']['literal']
  | (string & {})

export const transformVariations = Object.fromEntries(
  rawVariations.map((v) => [v.DescriptorSchema.entries.type.literal, v]),
) as unknown as Record<TransformVariationType, (typeof rawVariations)[number]>

export const allTransformVariations = {
  ...transformVariations,
  ...transformVariations3D,
}

const CustomVariationFallbackSchema = v.object({
  type: v.string(),
  weight: v.number(),
  visible: v.optional(v.boolean(), true),
})

export const TransformVariationDescriptor = v.variant('type', [
  ...Object.values(allTransformVariations).map(
    (variation) => variation.DescriptorSchema,
  ),
  CustomVariationFallbackSchema,
])

export type TransformVariationDescriptor = v.InferOutput<
  typeof TransformVariationDescriptor
>

export const variationTypes = [
  ...rawVariations.map((v) => v.DescriptorSchema.entries.type.literal),
] as string[]

const allVariationTypes = [...variationTypes, ...variationTypes3D]

const parametricVariationTypes = Object.values(parametricVariations).map(
  (o) => o.DescriptorSchema.entries.type.literal,
)
type ParametricVariationType = (typeof parametricVariationTypes)[number]

export type ParametricVariationDescriptor = Extract<
  TransformVariationDescriptor,
  { type: ParametricVariationType }
>

export function isParametricVariationType(
  variationType: TransformVariationType | TransformVariationType3D,
): variationType is ParametricVariationType {
  return (parametricVariationTypes as string[]).includes(variationType)
}

export function isParametricVariation(
  v: TransformVariationDescriptor,
): v is ParametricVariationDescriptor {
  return isParametricVariationType(v.type)
}

/**
 * Parametric in either the 2D or 3D registry. Both expose `params` plus a
 * slider editor, but `isParametricVariationType` only knows the 2D registry —
 * UI that surfaces parameter editors (e.g. the variation selector) must use
 * this combined check so 3D parametric variations show their params too.
 */
export function isAnyParametricVariationType(
  variationType: TransformVariationType | TransformVariationType3D,
): boolean {
  return (
    isParametricVariationType(variationType) ||
    isParametricVariationType3D(variationType)
  )
}

export function isVariationType(
  maybeType: string,
): maybeType is TransformVariationType | TransformVariationType3D {
  return typeof maybeType === 'string' && allVariationTypes.includes(maybeType)
}
