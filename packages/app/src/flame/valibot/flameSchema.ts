import * as v from 'valibot'
import { generateTransformId, generateVariationId } from '../transformFunction'
import { TransformVariationSchema } from './variationSchema'
import type { DrawMode } from '../drawMode'

// todo: move to defaults file/module
// DEFAULT values and schema fallbacks
const latestValibotVersion = '1.0'
const flameDescriptorVersionDefault = latestValibotVersion
export const backgroundColorDefault: [number, number, number] = [0, 0, 0]
export const backgroundColorDefaultWhite: [number, number, number] = [1, 1, 1]
const cameraDefault: { zoom: number; position: [number, number] } = {
  zoom: 1,
  position: [0, 0],
}
const renderSettingsDefult = {
  exposure: 0.25,
  skipIters: 20,
  drawMode: 'light' as DrawMode,
  backgroundColor: backgroundColorDefault,
  camera: cameraDefault,
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

const variationArraySchema = v.pipe(
  v.array(TransformVariationSchema),
  v.transform((variations) =>
    Object.fromEntries(
      variations.map((variation) => [generateVariationId(), variation]),
    ),
  ),
)

const variationRecordSchema = v.record(
  variationIdSchema,
  TransformVariationSchema,
)
export const TransformFunctionSchema = v.object({
  probability: v.number(),
  preAffine: AffineParamsSchema,
  postAffine: AffineParamsSchema,
  color: v.object({
    x: v.number(),
    y: v.number(),
  }),
  variations: v.union([variationArraySchema, variationRecordSchema]),
})

const cameraObjSchema = v.object({
  zoom: v.optional(v.number(), cameraDefault.zoom),
  position: v.fallback(
    v.optional(v.tuple([v.number(), v.number()]), cameraDefault.position),
    cameraDefault.position,
  ),
})

const RenderSettingsSchema = v.fallback(
  v.object({
    exposure: v.number(),
    skipIters: v.number(),
    drawMode: DrawModeSchema,
    backgroundColor: v.fallback(
      v.tuple([v.number(), v.number(), v.number()]),
      backgroundColorDefault,
    ),
    camera: v.fallback(cameraObjSchema, cameraDefault),
  }),
  renderSettingsDefult,
)

const transformArraySchema = v.pipe(
  v.array(TransformFunctionSchema),
  v.transform((transforms) => ({
    metadata: flameDescriptorVersionDefault,
    renderSettings: renderSettingsDefult,
    transforms: Object.fromEntries(
      transforms.map((transform) => [generateTransformId(), transform]),
    ),
  })),
)
const flameTransformsSchema = v.object({
  metadata: v.fallback(v.string(), flameDescriptorVersionDefault),
  renderSettings: RenderSettingsSchema,
  transforms: v.record(transformIdSchema, TransformFunctionSchema),
})

export const FlameDescriptorSchema = v.union([
  transformArraySchema,
  flameTransformsSchema,
])
