import * as v from 'valibot'
import { TransformVariationSchema } from './variationSchema'
import type { DrawMode } from '../drawMode'

// default values and schema fallbacks
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
const metadataDefault = {
  version: flameDescriptorVersionDefault,
  author: 'unknown',
}

export const TransformIdSchema = v.pipe(v.string(), v.brand('TransformId'))
export const VariationIdSchema = v.pipe(v.string(), v.brand('VariationId'))
export const VariationTypeSchema = v.pipe(v.string(), v.brand('VariationType'))
export const DrawModeSchema = v.union([v.literal('light'), v.literal('paint')])

export const AffineParamsSchema = v.object({
  a: v.number(),
  b: v.number(),
  c: v.number(),
  d: v.number(),
  e: v.number(),
  f: v.number(),
})

const VariationRecordSchema = v.record(
  VariationIdSchema,
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
  variations: VariationRecordSchema,
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

const FlameMetadataSchema = v.fallback(
  v.object({ version: v.string(), author: v.string() }),
  metadataDefault,
)

export const FlameDescriptorSchema = v.object({
  metadata: FlameMetadataSchema,
  renderSettings: RenderSettingsSchema,
  transforms: v.record(TransformIdSchema, TransformFunctionSchema),
})
