import { prettyPrintValibotErrors } from '@/utils/prettyPrintValibotErrors'
import * as v from '@/valibot'
import { AffineParamsSchema } from '../affineTranform'
import { ColorInitMode } from '../colorInitMode'
import { DrawMode } from '../drawMode'
import { PointInitMode } from '../pointInitMode'
import { TransformVariationDescriptor } from '../variations'

// default values and schema fallbacks
export const backgroundColorDefault: [number, number, number] = [0, 0, 0]
export const backgroundColorDefaultWhite: [number, number, number] = [1, 1, 1]
export const MIN_CAMERA_ZOOM_VALUE: number = 0.01
export const MAX_CAMERA_ZOOM_VALUE: number = 500
const cameraDefault: { zoom: number; position: [number, number] } = {
  zoom: 1,
  position: [0, 0],
}
const _edgeFadeColorDefault: [number, number, number, number] = [0, 0, 0, 0.8]
const MAX_SKIP_ITERS_VALUE = 30
const MIN_EXPOSURE_VALUE = -8
const MAX_EXPOSURE_VALUE = 8
const renderSettingsDefault: RenderSettings = {
  exposure: 0.25,
  skipIters: 20,
  drawMode: 'light',
  backgroundColor: backgroundColorDefault,
  camera: cameraDefault,
  colorInitMode: 'colorInitZero',
  pointInitMode: 'pointInitUnitDisk',
  vibrancy: 0.5,
  contrast: 1,
  gamma: 2.2,
  highlightPower: 0.5,
  densityEstimationQuality: 0.8,
  paletteMode: 0,
  palettePhase: 0,
  paletteSpeed: 0.5,
}
export const latestSchemaVersion = '1.0'
const MAX_LENGTH_AUTHOR_STRING = 255
const MAX_LENGTH_VERSION_STRING = 10
const metadataDefault = {
  version: latestSchemaVersion,
  author: 'unknown',
}

export type TransformId = v.InferOutput<typeof TransformId>
export const TransformId = v.pipe(v.string(), v.brand('TransformId'))
export type VariationId = v.InferOutput<typeof VariationId>
export const VariationId = v.pipe(v.string(), v.brand('VariationId'))

const VariationRecord = v.record(VariationId, TransformVariationDescriptor)

export type TransformFunction = v.InferOutput<typeof TransformFunction>
export const TransformFunction = v.object({
  probability: v.number(),
  preAffine: AffineParamsSchema,
  postAffine: AffineParamsSchema,
  color: v.object({
    x: v.number(),
    y: v.number(),
  }),
  visible: v.optional(v.boolean(), true),
  variations: VariationRecord,
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

const MIN_VIBRANCY_VALUE = 0
const MAX_VIBRANCY_VALUE = 3

type RenderSettings = v.InferOutput<typeof RenderSettings>
const RenderSettings = v.object({
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
  drawMode: v.optional(DrawMode, 'light'),
  colorInitMode: v.optional(ColorInitMode, 'colorInitZero'),
  pointInitMode: v.optional(PointInitMode, 'pointInitUnitDisk'),
  vibrancy: v.optional(
    v.pipe(
      v.number(),
      v.minValue(MIN_VIBRANCY_VALUE),
      v.maxValue(MAX_VIBRANCY_VALUE),
    ),
    0.5,
  ),
  contrast: v.optional(v.pipe(v.number(), v.minValue(0.01), v.maxValue(20)), 1),
  gamma: v.optional(v.pipe(v.number(), v.minValue(0.1), v.maxValue(8)), 2.2),
  highlightPower: v.optional(
    v.pipe(v.number(), v.minValue(0), v.maxValue(2)),
    0.5,
  ),
  densityEstimationQuality: v.optional(v.pipe(v.number(), v.minValue(0)), 0.8),
  paletteMode: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1)),
    0,
  ),
  palettePhase: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
  paletteSpeed: v.optional(
    v.pipe(v.number(), v.minValue(0), v.maxValue(30)),
    0.5,
  ),
  backgroundColor: v.optional(
    v.tuple([ColorValueSchema, ColorValueSchema, ColorValueSchema]),
  ),
  camera: v.optional(CameraObjSchema, cameraDefault),
  edgeFadeColor: v.optional(
    v.tuple([
      ColorValueSchema,
      ColorValueSchema,
      ColorValueSchema,
      ColorValueSchema,
    ]),
  ),
})

const FlameMetadata = v.object({
  author: v.optional(
    v.pipe(v.string(), v.maxLength(MAX_LENGTH_AUTHOR_STRING)),
    metadataDefault.author,
  ),
})

const FlameDescriptorVersion = v.pipe(
  v.string(),
  v.nonEmpty('Please specify a non-empty version'),
  v.maxLength(MAX_LENGTH_VERSION_STRING),
)

export type TransformRecord = v.InferOutput<typeof TransformRecord>
const TransformRecord = v.record(TransformId, TransformFunction)

export type FlameDescriptor = v.InferOutput<typeof FlameDescriptor>
export const FlameDescriptor = v.object({
  version: v.optional(FlameDescriptorVersion),
  metadata: v.optional(FlameMetadata, metadataDefault),
  renderSettings: v.optional(RenderSettings, renderSettingsDefault),
  transforms: TransformRecord,
})

export function validateFlame(data: unknown): FlameDescriptor {
  const result = v.safeParse(FlameDescriptor, data)
  if (!result.success) {
    const flatErrors = v.flatten<typeof FlameDescriptor>(result.issues)
    prettyPrintValibotErrors(flatErrors)
    throw new Error(
      'This flame cannot be shown, please check console for more info.',
    )
  }
  return result.output
}

export function condenseFlameDescriptor(
  descriptor: FlameDescriptor,
): FlameDescriptor {
  const condensed = JSON.parse(JSON.stringify(descriptor)) as FlameDescriptor
  const visibleTransforms = Object.entries(condensed.transforms).filter(
    ([, tr]) => tr.visible,
  )
  condensed.transforms = Object.fromEntries(
    visibleTransforms.map(([tid, tr]) => {
      const visibleVariations = Object.entries(tr.variations).filter(
        ([, v]) => v.visible,
      )
      return [
        tid,
        {
          ...tr,
          variations: Object.fromEntries(visibleVariations),
        },
      ]
    }),
  )
  return condensed
}
