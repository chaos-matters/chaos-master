import * as v from 'valibot'
import { recordKeys } from '@/utils/record'
import { drawModeToImplFn } from '../drawMode'
import { TransformVariationSchema } from './variationSchema'

// default values and schema fallbacks
export const backgroundColorDefault: [number, number, number] = [0, 0, 0]
export const backgroundColorDefaultWhite: [number, number, number] = [1, 1, 1]
export const MIN_CAMERA_ZOOM_VALUE: number = 0.01
export const MAX_CAMERA_ZOOM_VALUE: number = 500
const cameraDefault: { zoom: number; position: [number, number] } = {
  zoom: 1,
  position: [0, 0],
}
const MAX_SKIP_ITERS_VALUE = 30
const MIN_EXPOSURE_VALUE = -4
const MAX_EXPOSURE_VALUE = 4
const renderSettingsDefult: v.InferOutput<typeof RenderSettingsSchema> = {
  exposure: 0.25,
  skipIters: 20,
  drawMode: 'light',
  backgroundColor: backgroundColorDefault,
  camera: cameraDefault,
}
export const latestSchemaVersion = '1.0'
const MAX_LENGTH_AUTHOR_STRING = 255
const MAX_LENGTH_VERSION_STRING = 10
const metadataDefault = {
  version: latestSchemaVersion,
  author: 'unknown',
}

export const TransformIdSchema = v.pipe(v.string(), v.brand('TransformId'))
export const VariationIdSchema = v.pipe(v.string(), v.brand('VariationId'))
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

const ZoomValueSchema = v.pipe(
  v.number(),
  v.minValue(MIN_CAMERA_ZOOM_VALUE),
  v.maxValue(MAX_CAMERA_ZOOM_VALUE),
)
const CameraObjSchema = v.object({
  zoom: v.optional(ZoomValueSchema, cameraDefault.zoom),
  position: v.optional(
    v.tuple([v.number(), v.number()]),
    cameraDefault.position,
  ),
})

const ColorValueSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(1))
const RenderSettingsSchema = v.object({
  exposure: v.pipe(
    v.number(),
    v.minValue(MIN_EXPOSURE_VALUE),
    v.maxValue(MAX_EXPOSURE_VALUE),
  ),
  skipIters: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(MAX_SKIP_ITERS_VALUE),
  ),
  drawMode: v.optional(DrawModeSchema, 'light'),
  backgroundColor: v.optional(
    v.tuple([ColorValueSchema, ColorValueSchema, ColorValueSchema]),
  ),
  camera: v.optional(CameraObjSchema, cameraDefault),
})

const FlameMetadataSchema = v.object({
  author: v.optional(
    v.pipe(v.string(), v.maxLength(MAX_LENGTH_AUTHOR_STRING)),
    metadataDefault.author,
  ),
})

const FlameDescriptorVersionSchema = v.pipe(
  v.string(),
  v.nonEmpty('Please specify a non-empty version'),
  v.maxLength(MAX_LENGTH_VERSION_STRING),
)

export const FlameDescriptorSchema = v.object({
  version: v.optional(FlameDescriptorVersionSchema),
  metadata: v.optional(FlameMetadataSchema, metadataDefault),
  renderSettings: v.optional(RenderSettingsSchema, renderSettingsDefult),
  transforms: v.record(TransformIdSchema, TransformFunctionSchema),
})

export type FlameDescriptorDraft = v.InferInput<typeof FlameDescriptorSchema>
