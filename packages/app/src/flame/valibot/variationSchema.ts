import * as v from 'valibot'
import { variationTypes } from '../variations'
import { BlobParamsSchema } from '../variations/parametric/blob'

// const blobParamsData: v.InferOutput<typeof BlobParamsSchema> = null
// Object.keys(BlobParamsSchema['~types'].output).map((key) => {
//     blobParamsData[key] = f32
//   }
// })
const BlobParamsDefaults = {
  high: 2,
  low: 1,
  waves: 1,
}
const BlobVariationSchema = {
  schema: v.object(BlobParamsSchema),
  defaults: BlobParamsDefaults,
}
export const parametricVariations = {
  blob: BlobVariationSchema,
}

const variationTypeKeysSchema = v.object(
  Object.fromEntries(variationTypes.map((key) => [key, v.any()])),
)
export const VariationTypeSchema = v.keyof(variationTypeKeysSchema)
const parametricVariationSchemas = Object.entries(parametricVariations).map(
  ([_, variation]) =>
    v.object({
      type: VariationTypeSchema,
      weight: v.number(),
      params: v.fallback(v.optional(variation.schema), variation.defaults),
    }),
)
// const simpleVariationSchema = Object.entries(simpleVariations).map(
//   ([key, variation]) =>
//     v.object({
//       type: v.literal(key),
//       weight: v.number(),
//     }),
// )
export const TransformVariationSchema = v.union(parametricVariationSchemas)
