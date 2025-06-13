import * as v from 'valibot'
import { drawModeToImplFn } from '../drawMode'

const transformIdSchema = v.pipe(v.string(), v.brand('TransformId'))
const variationIdSchema = v.pipe(v.string(), v.brand('VariationId'))
const drawModeKeysSchema = v.object(
  Object.fromEntries(
    Object.keys(drawModeToImplFn).map((key) => [key, v.any()]),
  ),
)
const DrawModeSchema = v.keyof(drawModeKeysSchema)

export type TransformId = v.InferOutput<typeof transformIdSchema>
export type VariationId = v.InferOutput<typeof variationIdSchema>
export type DrawMode = v.InferOutput<typeof DrawModeSchema>

export const AffineParamsSchema = v.object({
  a: v.number(),
  b: v.number(),
  c: v.number(),
  d: v.number(),
  e: v.number(),
  f: v.number(),
})
export const TransformVariationSchema = v.unknown()
export const TransformFunctionSchema = v.object({
  probability: v.number(),
  preAffine: AffineParamsSchema,
  postAffine: AffineParamsSchema,
  color: v.object({
    x: v.number(),
    y: v.number(),
  }),
  variations: v.record(variationIdSchema, TransformVariationSchema),
})

const RenderSettingsSchema = v.object({
  exposure: v.number(),
  skipIters: v.number(),
  drawMode: DrawModeSchema,
  backgroundColor: v.pipe(
    v.fallback(v.array(v.number()), [0, 0, 0]),
    v.length(3),
  ),
  camera: v.object({
    zoom: v.number(),
    position: v.pipe(v.array(v.number()), v.length(2)),
  }),
})

export const FlameDescriptorSchema = v.object({
  renderSettings: RenderSettingsSchema,
  transforms: v.record(transformIdSchema, TransformFunctionSchema),
})
