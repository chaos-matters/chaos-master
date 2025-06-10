import * as v from 'valibot'
import { transformVariationNames } from '../variations'
import { parametricVariationParamsSchemas } from '.'
import type { TransformVariation } from '../variations'

function isParametricKey(
  key: string,
): key is keyof typeof parametricVariationParamsSchemas {
  return key in parametricVariationParamsSchemas
}

type ValueUnion<T> = T[keyof T]
type ParametricVarType = ValueUnion<typeof parametricVariationParamsSchemas>

const simpleVariationSchema = v.optional(v.object({}))
export const transformVariationsParamsSchemas = transformVariationNames.map(
  (key) =>
    [
      key,
      isParametricKey(key)
        ? parametricVariationParamsSchemas[key]
        : simpleVariationSchema,
    ] as [TransformVariation, ParametricVarType],
)
const transformVariationSchemas = transformVariationsParamsSchemas.map(
  ([key, paramSchema]) =>
    v.object({
      type: v.literal(key),
      weight: v.number(),
      params: v.optional(paramSchema),
    }),
)

export const TransformVariationSchema = v.variant(
  'type',
  transformVariationSchemas,
)
export type TransformVariationDescriptor = v.InferOutput<
  typeof TransformVariationSchema
>
