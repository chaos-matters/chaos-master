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
const cameraDefault: {
  zoom: number
  position: [number, number]
  rotation: number
} = {
  zoom: 1,
  position: [0, 0],
  rotation: 0,
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

// `TransformFunction`, `TransformRecord`, `FlameDescriptor` and the new
// `FlameDescriptor3D` are built from a shared factory further down — once
// `RenderSettings`/`FlameMetadata` are in scope — so the 2D and 3D descriptors
// differ only by their affine schema.

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
  rotation: v.optional(v.number(), cameraDefault.rotation),
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

// ── Descriptor schema factory ────────────────────────────────────────
// Parameterized by the affine schema so 2D and 3D flames share one
// definition. 3D affines carry 12 params (a–l); validating a 3D flame
// against the 2D schema would silently strip g–l (valibot drops unknown
// keys), which is why preview/3D flames previously bypassed validation.
function makeFlameDescriptorSchema<
  TAffine extends typeof AffineParamsSchema | typeof AffineParams3DSchema,
>(affine: TAffine) {
  const TransformFunction = v.object({
    probability: v.number(),
    preAffine: affine,
    postAffine: affine,
    color: v.object({ x: v.number(), y: v.number() }),
    colorSpeed: v.optional(v.number(), 0.4),
    visible: v.optional(v.boolean(), true),
    variations: VariationRecord,
  })
  const TransformRecord = v.record(TransformId, TransformFunction)
  const FlameDescriptor = v.object({
    version: v.optional(FlameDescriptorVersion),
    metadata: v.optional(FlameMetadata, metadataDefault),
    renderSettings: v.optional(RenderSettings, renderSettingsDefault),
    transforms: TransformRecord,
    finalTransform: v.optional(affine),
  })
  return { TransformFunction, TransformRecord, FlameDescriptor }
}

const schema2D = makeFlameDescriptorSchema(AffineParamsSchema)
const schema3D = makeFlameDescriptorSchema(AffineParams3DSchema)

export const TransformFunction = schema2D.TransformFunction
export type TransformFunction = v.InferOutput<typeof TransformFunction>
const TransformRecord = schema2D.TransformRecord
export type TransformRecord = v.InferOutput<typeof TransformRecord>

export const FlameDescriptor = schema2D.FlameDescriptor
export type FlameDescriptor = v.InferOutput<typeof FlameDescriptor>

export const FlameDescriptor3D = schema3D.FlameDescriptor
export type FlameDescriptor3D = v.InferOutput<typeof FlameDescriptor3D>

function parseFlame<TSchema extends Parameters<typeof v.safeParse>[0]>(
  schema: TSchema,
  data: unknown,
) {
  const result = v.safeParse(schema, data)
  if (!result.success) {
    prettyPrintValibotErrors(v.flatten(result.issues))
    throw new Error(
      'This flame cannot be shown, please check console for more info.',
    )
  }
  return result.output
}

/**
 * Validate a flame, dispatching to the 3D schema when the descriptor declares
 * `dimensions: 3` so 3D affines (a–l) survive parsing instead of being stripped
 * to a 2D affine. Returns the shared `FlameDescriptor` type the app threads
 * through both the 2D and 3D pipelines.
 */
export function validateFlame(data: unknown): FlameDescriptor {
  migrateFlameVariationTypes(data)
  const dimensions = (data as { renderSettings?: { dimensions?: number } })
    ?.renderSettings?.dimensions
  if (dimensions === 3) {
    return parseFlame(schema3D.FlameDescriptor, data)
  }
  return parseFlame(schema2D.FlameDescriptor, data)
}

export function validateFlame3D(data: unknown): FlameDescriptor3D {
  migrateFlameVariationTypes(data)
  return parseFlame(schema3D.FlameDescriptor, data)
}

export function tryValidateFlame(data: unknown): FlameDescriptor | undefined {
  const result = v.safeParse(schema2D.FlameDescriptor, data)
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
