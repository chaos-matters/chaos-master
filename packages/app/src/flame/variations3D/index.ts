import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'
import * as parametricVariations3D from '../variations/parametric3D'
import * as simpleVariations3D from '../variations/simple3D'

export const transformVariations3D = {
  ...simpleVariations3D,
  ...parametricVariations3D,
}

export type TransformVariationDescriptor3D = v.InferOutput<
  typeof TransformVariationDescriptor3D
>
export const TransformVariationDescriptor3D = v.variant(
  'type',
  Object.values(transformVariations3D).map(
    (variation) => variation.DescriptorSchema,
  ),
)

export type TransformVariationType3D = Extract<
  keyof typeof transformVariations3D,
  string
>
export const variationTypes3D = recordKeys(transformVariations3D)

export function isVariationType3D(
  maybeType: string,
): maybeType is TransformVariationType3D {
  return (variationTypes3D as string[]).includes(maybeType)
}

export function isParametricVariationType3D(
  maybeType: string,
): maybeType is Extract<keyof typeof parametricVariations3D, string> {
  return (recordKeys(parametricVariations3D) as string[]).includes(maybeType)
}
