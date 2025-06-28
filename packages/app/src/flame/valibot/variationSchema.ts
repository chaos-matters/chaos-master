import * as v from 'valibot'
import { recordEntries } from '@/utils/record'
import { transformVariationNames } from '../variations'
import { parametricVariationParamsSchemas } from '.'
import type { TransformVariation } from '../variations'

const simpleVariationSchema = v.optional(v.object({}))

type ValueUnion<T> = T[keyof T]
type ParametricVarType = ValueUnion<typeof parametricVariationParamsSchemas>

function isParametricKey(
  key: string,
): key is keyof typeof parametricVariationParamsSchemas {
  return key in parametricVariationParamsSchemas
}

export const transformVariationsParamsSchemas = recordEntries(
  Object.fromEntries(
    transformVariationNames.map((key) => [
      key,
      isParametricKey(key)
        ? parametricVariationParamsSchemas[key]
        : simpleVariationSchema,
    ]),
  ) as Record<TransformVariation, ParametricVarType>,
)

const transformVariationSchemas = transformVariationsParamsSchemas.map(
  ([key, paramSchema]) =>
    v.object({
      type: v.literal(key),
      weight: v.number(),
      params: v.optional(paramSchema),
    }),
)

export const TransformVariationSchema = v.union(transformVariationSchemas)
export type TransformVariationDescriptor = v.InferOutput<
  typeof TransformVariationSchema
>
