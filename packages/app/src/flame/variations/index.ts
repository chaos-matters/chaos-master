import * as v from '@/valibot'
import { parametricVariations } from './parametric'
import * as simpleVariations from './simple'

const rawVariations = [
  ...Object.values(simpleVariations),
  ...Object.values(parametricVariations),
]

const CustomVariationFallbackSchema = v.object({
  type: v.string(),
  weight: v.number(),
  visible: v.optional(v.boolean(), true),
})

export const TransformVariationDescriptor = v.variant('type', [
  ...rawVariations.map((variation) => variation.DescriptorSchema),
  CustomVariationFallbackSchema,
])

export type TransformVariationDescriptor = v.InferOutput<
  typeof TransformVariationDescriptor
>

export type TransformVariationType =
  | TransformVariationDescriptor['type']
  | (string & {})

export const transformVariations = Object.fromEntries(
  rawVariations.map((v) => [v.DescriptorSchema.entries.type.literal, v]),
) as unknown as Record<TransformVariationType, (typeof rawVariations)[number]>

export const variationTypes = [
  ...rawVariations.map((v) => v.DescriptorSchema.entries.type.literal),
] as string[]
const parametricVariationTypes = Object.values(parametricVariations).map(
  (o) => o.DescriptorSchema.entries.type.literal,
)
type ParametricVariationType = (typeof parametricVariationTypes)[number]

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeType: any,
): maybeType is TransformVariationType {
  return typeof maybeType === 'string' && variationTypes.includes(maybeType)
}
