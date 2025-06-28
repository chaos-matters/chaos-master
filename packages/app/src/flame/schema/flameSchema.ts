import * as v from 'valibot'
import { recordKeys } from '@/utils/record'
import { drawModeToImplFn } from '../drawMode'
import { TransformVariationSchema } from './variationSchema'

// default values and schema fallbacks
const latestSchemaVersion = '1.0'
export const backgroundColorDefault: [number, number, number] = [0, 0, 0]
export const backgroundColorDefaultWhite: [number, number, number] = [1, 1, 1]
const cameraDefault: { zoom: number; position: [number, number] } = {
  zoom: 1,
  position: [0, 0],
}
const renderSettingsDefult: v.InferOutput<typeof RenderSettingsSchema> = {
  exposure: 0.25,
  skipIters: 20,
  drawMode: 'light',
  backgroundColor: backgroundColorDefault,
  camera: cameraDefault,
}
const metadataDefault = {
  version: latestSchemaVersion,
  author: 'unknown',
}

export const TransformIdSchema = v.pipe(v.string(), v.brand('TransformId'))
export const VariationIdSchema = v.pipe(v.string(), v.brand('VariationId'))
export const VariationTypeSchema = v.pipe(v.string(), v.brand('VariationType'))
export const DrawModeSchema = v.picklist(recordKeys(drawModeToImplFn))

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

const CameraObjSchema = v.object({
  zoom: v.optional(v.number(), cameraDefault.zoom),
  position: v.optional(
    v.tuple([v.number(), v.number()]),
    cameraDefault.position,
  ),
})

const RenderSettingsSchema = v.object({
  exposure: v.number(),
  skipIters: v.number(),
  drawMode: v.optional(DrawModeSchema, 'light'),
  backgroundColor: v.optional(v.tuple([v.number(), v.number(), v.number()])),
  camera: v.optional(CameraObjSchema, cameraDefault),
})

const FlameMetadataSchema = v.object({
  version: v.pipe(
    v.string(),
    v.nonEmpty('Please specify a non-empty string for version'),
  ),
  author: v.string(),
})

export const FlameDescriptorSchema = v.object({
  metadata: v.optional(FlameMetadataSchema, metadataDefault),
  renderSettings: v.optional(RenderSettingsSchema, renderSettingsDefult),
  transforms: v.record(TransformIdSchema, TransformFunctionSchema),
})
