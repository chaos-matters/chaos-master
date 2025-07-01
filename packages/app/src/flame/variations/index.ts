import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'
import { parametricVariations } from './parametric'
import * as simpleVariations from './simple'

export const transformVariations = {
  ...simpleVariations,
  ...parametricVariations,
}

export type TransformVariationDescriptor = v.InferOutput<
  typeof TransformVariationDescriptor
>
export const TransformVariationDescriptor = v.variant(
  'type',
  Object.values(transformVariations).map(
    (variation) => variation.DescriptorSchema,
  ),
)

export type TransformVariationType = keyof typeof transformVariations
export const variationTypes = recordKeys(transformVariations)

type ParametricVariationType = (typeof parametricVariationTypes)[number]
const parametricVariationTypes = Object.values(parametricVariations).map(
  (o) => o.DescriptorSchema.entries.type.literal,
)

export type ParametricVariationDescriptor = Extract<
  TransformVariationDescriptor,
  { type: ParametricVariationType }
>

export function isParametricVariationType(
  variationType: TransformVariationType,
): variationType is ParametricVariationType {
  return (parametricVariationTypes as string[]).includes(variationType)
}

export function isParametricVariation(
  v: TransformVariationDescriptor,
): v is ParametricVariationDescriptor {
  return isParametricVariationType(v.type)
}

export function isVariationType(
  maybeType: string,
): maybeType is TransformVariationType {
  return (variationTypes as string[]).includes(maybeType)
}
