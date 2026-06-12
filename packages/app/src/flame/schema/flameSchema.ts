import { deepClone } from '@/utils/clone'
import { prettyPrintValibotErrors } from '@/utils/prettyPrintValibotErrors'
import { recordEntries } from '@/utils/record'
import * as v from '@/valibot'
import { AffineParamsSchema } from '../affineTranform'
import { AffineParams3DSchema } from '../affineTransform3D'

export { AffineParams3DSchema }
import { ColorInitMode } from '../colorInitMode'
import { DrawMode } from '../drawMode'
import { PointInitMode } from '../pointInitMode'
import { TransformVariationDescriptor } from '../variations'
import { migrateFlameVariationTypes } from './migrateFlameTypes'

// default values and schema fallbacks
export const backgroundColorDefault: [number, number, number] = [0, 0, 0]
export const backgroundColorDefaultWhite: [number, number, number] = [1, 1, 1]
export const MIN_CAMERA_ZOOM_VALUE: number = 0.01
export const MAX_CAMERA_ZOOM_VALUE: number = 500
const cameraDefault: { zoom: number; position: [number, number] } = {
  zoom: 1,
  position: [0, 0],
}
export const camera3DDefault: {
  theta: number
  phi: number
  radius: number
  target: [number, number, number]
  fov: number
} = {
  theta: 0,
  phi: Math.PI / 2,
  radius: 5,
  target: [0, 0, 0] as [number, number, number],
  fov: 60,
}
const _edgeFadeColorDefault: [number, number, number, number] = [0, 0, 0, 0.8]
const MAX_SKIP_ITERS_VALUE = 30
const MIN_EXPOSURE_VALUE = -8
const MAX_EXPOSURE_VALUE = 8
export const renderSettingsDefault: RenderSettings = {
  dimensions: 2,
  exposure: 0.25,
  skipIters: 20,
  drawMode: 'light',
  backgroundColor: backgroundColorDefault,
  camera: cameraDefault,
  camera3D: camera3DDefault,
  colorInitMode: 'colorInitZero',
  pointInitMode: 'pointInitUnitDisk',
  vibrancy: 0.5,
  contrast: 1,
  gamma: 2.2,
  depthColorPower: 0.0,
  lightDirection: [-0.5, 0.5, -1.0],
  lightPower: 0.0,
  highlightPower: 0.5,
  densityEstimationQuality: 0.8,
  estimatorCurve: 0.5,
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
  name: '',
  description: '',
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
  colorSpeed: v.optional(v.number(), 0.4),
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

export type Camera3DObj = v.InferOutput<typeof Camera3DObjSchema>
export const Camera3DObjSchema = v.object({
  theta: v.optional(v.number(), camera3DDefault.theta),
  phi: v.optional(v.number(), camera3DDefault.phi),
  radius: v.optional(v.number(), camera3DDefault.radius),
  target: v.optional(
    v.tuple([v.number(), v.number(), v.number()]),
    camera3DDefault.target,
  ),
  fov: v.optional(v.number(), camera3DDefault.fov),
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
  dimensions: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(3)),
    2,
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
  depthColorPower: v.optional(
    v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
    0.0,
  ),
  lightDirection: v.optional(v.tuple([v.number(), v.number(), v.number()]), [
    -0.5, 0.5, -1.0,
  ] as [number, number, number]),
  lightPower: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(5)), 0.0),
  highlightPower: v.optional(
    v.pipe(v.number(), v.minValue(0), v.maxValue(2)),
    0.5,
  ),
  densityEstimationQuality: v.optional(v.pipe(v.number(), v.minValue(0)), 0.8),
  estimatorCurve: v.optional(
    v.pipe(v.number(), v.minValue(0.1), v.maxValue(1)),
    0.5,
  ),
  paletteMode: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1)),
    0,
  ),
  palettePhase: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
  paletteSpeed: v.optional(v.pipe(v.number(), v.minValue(0)), 0.5),
  backgroundColor: v.optional(
    v.tuple([ColorValueSchema, ColorValueSchema, ColorValueSchema]),
  ),
  camera: v.optional(CameraObjSchema, cameraDefault),
  camera3D: v.optional(Camera3DObjSchema, camera3DDefault),
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
  name: v.optional(v.string(), ''),
  description: v.optional(v.string(), ''),
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
  finalTransform: v.optional(AffineParamsSchema),
})

export function validateFlame(data: unknown): FlameDescriptor {
  migrateFlameVariationTypes(data)
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

export function tryValidateFlame(data: unknown): FlameDescriptor | undefined {
  const result = v.safeParse(FlameDescriptor, data)
  if (!result.success) return undefined
  return result.output
}

export function condenseFlameDescriptor(
  descriptor: FlameDescriptor,
): FlameDescriptor {
  const condensed = deepClone(descriptor)
  const visibleTransforms = recordEntries(condensed.transforms).filter(
    ([, tr]) => tr.visible,
  )
  condensed.transforms = Object.fromEntries(
    visibleTransforms.map(([tid, tr]) => {
      const visibleVariations = recordEntries(tr.variations).filter(
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
