import * as v from 'valibot'
import { transformVariationNames } from '../variations'
import { parametricVariationParamsSchemas } from '.'
import type { TransformVariation } from '../variations'

const simpleVariationSchema = {
  schema: v.optional(v.object({})),
  defaults: undefined,
}
type ValueUnion<T> = T[keyof T]
type ParametricVarType = ValueUnion<typeof parametricVariationParamsSchemas>

function isParametricKey(
  key: string,
): key is keyof typeof parametricVariationParamsSchemas {
  return key in parametricVariationParamsSchemas
}

export const transformVariationsParamsSchemas = Object.fromEntries(
  transformVariationNames.map((key) => [
    key,
    isParametricKey(key)
      ? parametricVariationParamsSchemas[key]
      : simpleVariationSchema,
  ]),
) as Record<TransformVariation, ParametricVarType>

type Entries<T> = {
  [K in keyof T]: [K, T[K]]
}[keyof T][]

const variationEntries = Object.entries(
  transformVariationsParamsSchemas,
) as Entries<typeof transformVariationsParamsSchemas>

const transformVariationSchemas = variationEntries.map(([key, variation]) =>
  v.object({
    type: v.literal(key),
    weight: v.number(),
    params: v.fallback(v.optional(variation.schema), variation.defaults),
  }),
)

export const TransformVariationSchema = v.union(transformVariationSchemas)
export type TransformVariationDescriptor = v.InferOutput<
  typeof TransformVariationSchema
>
