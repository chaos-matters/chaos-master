import * as v from 'valibot'
import { TransformVariationSchema } from './variationSchema'

// todo: move to defaults file/module
// DEFAULT values and schema fallbacks
export const backgroundColorDefault: [number, number, number] = [0, 0, 0]
export const backgroundColorDefaultWhite: [number, number, number] = [1, 1, 1]
const cameraDefault: { zoom: number; position: [number, number] } = {
  zoom: 1,
  position: [0, 0],
}

export const transformIdSchema = v.pipe(v.string(), v.brand('TransformId'))
export const variationIdSchema = v.pipe(v.string(), v.brand('VariationId'))
export const variationTypeSchema = v.pipe(v.string(), v.brand('VariationType'))
// const drawModeKeysSchema = v.object(
//   Object.fromEntries(
//     Object.keys(drawModeToImplFn).map((key) => [key, v.any()]),
//   ),
// )
// export const DrawModeSchema = v.keyof(drawModeKeysSchema)
export const DrawModeSchema = v.union([v.literal('light'), v.literal('paint')])

export const AffineParamsSchema = v.object({
  a: v.number(),
  b: v.number(),
  c: v.number(),
  d: v.number(),
  e: v.number(),
  f: v.number(),
})
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

const cameraObjSchema = v.object({
  zoom: v.optional(v.number(), cameraDefault.zoom),
  position: v.fallback(
    v.optional(v.tuple([v.number(), v.number()]), cameraDefault.position),
    cameraDefault.position,
  ),
})

const RenderSettingsSchema = v.object({
  exposure: v.number(),
  skipIters: v.number(),
  drawMode: DrawModeSchema,
  backgroundColor: v.fallback(
    v.tuple([v.number(), v.number(), v.number()]),
    backgroundColorDefault,
  ),
  camera: v.fallback(cameraObjSchema, cameraDefault),
})

export const FlameDescriptorSchema = v.object({
  renderSettings: RenderSettingsSchema,
  transforms: v.record(transformIdSchema, TransformFunctionSchema),
})
