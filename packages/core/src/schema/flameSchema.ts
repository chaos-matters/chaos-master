import * as v from 'valibot'
import { AffineParamsSchema } from '../math/affineTransform'
import { AffineParams3DSchema } from '../math/affineTransform3D'
import { pureClone } from '../utils/clone'
import { prettyPrintValibotErrors, processValibotErrors, } from '../utils/prettyPrintValibotErrors'
import { recordEntries } from '../utils/record'
import { migrateFlameVariationTypes } from './migrateFlameTypes'
import { ColorInitMode, DrawMode, PointInitMode } from './modes'

// default values and schema fallbacks
export const backgroundColorDefault: [number, number, number] = [0, 0, 0]
export const backgroundColorDefaultWhite: [number, number, number] = [1, 1, 1]
export const MIN_CAMERA_ZOOM_VALUE: number = 0.01
export const MAX_CAMERA_ZOOM_VALUE: number = 500
export const MIN_ORBIT_RADIUS: number = 0.02
export const MAX_ORBIT_RADIUS: number = 100

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
  roll: number
} = {
  theta: 0,
  phi: Math.PI / 2,
  radius: 5,
  target: [0, 0, 0] as [number, number, number],
  fov: 60,
  roll: 0,
}

const _edgeFadeColorDefault: [number, number, number, number] = [0, 0, 0, 0.8]
/**
 * Warm-up iterations before a point is plotted. 50, not the 30 the sidebar
 * once stopped at: ten bundled animations pulse up to 50, and a frame the
 * schema rejects is a PNG that will not open again (numberDomain.ts).
 */
export const MAX_SKIP_ITERS_VALUE = 50
const MIN_EXPOSURE_VALUE = -8
const MAX_EXPOSURE_VALUE = 8

export type RenderSettings = v.InferOutput<typeof RenderSettings>

export const renderSettingsDefault: RenderSettings = {
  dimensions: 2,
  exposure: 0.25,
  skipIters: 20,
  plotsPerChain: 16,
  autoExposure3D: false,
  autoExposure3DStrength: 1,
  autoExposure3DRefRadius: 5,
  autoExposure3DBase: 0,
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

export const MAX_FLAME_TRANSFORMS = 128
export const MAX_VARIATIONS_PER_TRANSFORM = 32
export const MAX_FLAME_VARIATIONS = 512
export const MAX_FLAME_ENTITY_ID_LENGTH = 128

const FORBIDDEN_ENTITY_IDS = new Set(['__proto__', 'constructor', 'prototype'])

export type SafeFlameEntityId = string & {
  readonly __safeFlameEntityId: true
}

export function isSafeFlameEntityId(
  value: unknown,
): value is SafeFlameEntityId {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_FLAME_ENTITY_ID_LENGTH ||
    FORBIDDEN_ENTITY_IDS.has(value)
  ) {
    return false
  }

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    const isDigit = code >= 48 && code <= 57
    const isUpper = code >= 65 && code <= 90
    const isUnderscore = code === 95
    const isLower = code >= 97 && code <= 122
    if (!isDigit && !isUpper && !isUnderscore && !isLower) return false
  }
  return true
}

export function isFlameGraphWithinLimits(
  transformCount: number,
  totalVariationCount: number,
  largestVariationCount: number,
): boolean {
  return (
    Number.isInteger(transformCount) &&
    Number.isInteger(totalVariationCount) &&
    Number.isInteger(largestVariationCount) &&
    transformCount >= 0 &&
    transformCount <= MAX_FLAME_TRANSFORMS &&
    totalVariationCount >= 0 &&
    totalVariationCount <= MAX_FLAME_VARIATIONS &&
    largestVariationCount >= 0 &&
    largestVariationCount <= MAX_VARIATIONS_PER_TRANSFORM
  )
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function flameComplexityError(data: unknown): string | undefined {
  if (!isPlainRecord(data)) {
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? 'flame descriptors must be plain objects'
      : undefined
  }
  const transforms = data.transforms
  if (!isPlainRecord(transforms)) {
    return typeof transforms === 'object' && transforms !== null
      ? 'transform records must be plain objects'
      : undefined
  }

  let transformCount = 0
  let totalVariationCount = 0
  let largestVariationCount = 0

  for (const transformId in transforms) {
    if (!Object.hasOwn(transforms, transformId)) continue
    transformCount++
    if (transformCount > MAX_FLAME_TRANSFORMS) {
      return `a flame may contain at most ${MAX_FLAME_TRANSFORMS} transforms`
    }
    if (!isSafeFlameEntityId(transformId)) {
      return `unsafe transform id "${transformId.slice(0, 64)}"`
    }

    const transform = transforms[transformId]
    if (!isPlainRecord(transform)) {
      if (typeof transform === 'object' && transform !== null) {
        return 'transform descriptors must be plain objects'
      }
      continue
    }
    const variations = transform.variations
    if (!isPlainRecord(variations)) {
      if (typeof variations === 'object' && variations !== null) {
        return 'variation records must be plain objects'
      }
      continue
    }

    let variationCount = 0
    for (const variationId in variations) {
      if (!Object.hasOwn(variations, variationId)) continue
      variationCount++
      totalVariationCount++
      if (variationCount > MAX_VARIATIONS_PER_TRANSFORM) {
        return `a transform may contain at most ${MAX_VARIATIONS_PER_TRANSFORM} variations`
      }
      if (totalVariationCount > MAX_FLAME_VARIATIONS) {
        return `a flame may contain at most ${MAX_FLAME_VARIATIONS} variations`
      }
      if (!isSafeFlameEntityId(variationId)) {
        return `unsafe variation id "${variationId.slice(0, 64)}"`
      }
      const variation = variations[variationId]
      if (
        !isPlainRecord(variation) &&
        typeof variation === 'object' &&
        variation !== null
      ) {
        return 'variation descriptors must be plain objects'
      }
    }
    largestVariationCount = Math.max(largestVariationCount, variationCount)
  }

  return isFlameGraphWithinLimits(
    transformCount,
    totalVariationCount,
    largestVariationCount,
  )
    ? undefined
    : 'flame graph exceeds renderer limits'
}

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

export const BaseVariationDescriptor = v.object({
  type: v.string(),
  weight: v.number(),
  visible: v.optional(v.boolean(), true),
  params: v.optional(v.record(v.string(), v.number())),
})
export type BaseVariationDescriptor = v.InferOutput<
  typeof BaseVariationDescriptor
>

export const VariationDescriptor = BaseVariationDescriptor
export type VariationDescriptor = BaseVariationDescriptor

/**
 * `v.number()` rejects NaN but ACCEPTS Infinity and -Infinity, because both are
 * `typeof 'number'`. An infinite camera value produced by a degenerate touch
 * gesture therefore validates cleanly and is persisted into autosave, share
 * links and session recordings, where it renders as a collapsed camera and is
 * very hard to trace back. Bounded fields like ZoomValueSchema are already safe
 * -- a maxValue check rejects Infinity -- so this is for the unbounded ones.
 */
export const finiteNumber = v.pipe(v.number(), v.finite())

const ZoomValueSchema = v.pipe(
  v.number(),
  v.minValue(MIN_CAMERA_ZOOM_VALUE),
  v.maxValue(MAX_CAMERA_ZOOM_VALUE),
)
const CameraObjSchema = v.object({
  zoom: v.optional(ZoomValueSchema, cameraDefault.zoom),
  position: v.optional(
    v.tuple([finiteNumber, finiteNumber]),
    cameraDefault.position,
  ),
  rotation: v.optional(finiteNumber, cameraDefault.rotation),
})

export type Camera3DObj = v.InferOutput<typeof Camera3DObjSchema>
export const Camera3DObjSchema = v.object({
  theta: v.optional(finiteNumber, camera3DDefault.theta),
  phi: v.optional(finiteNumber, camera3DDefault.phi),
  radius: v.optional(finiteNumber, camera3DDefault.radius),
  target: v.optional(
    v.tuple([finiteNumber, finiteNumber, finiteNumber]),
    camera3DDefault.target,
  ),
  fov: v.optional(finiteNumber, camera3DDefault.fov),
  roll: v.optional(finiteNumber, camera3DDefault.roll),
})

const ColorValueSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(1))

const MIN_VIBRANCY_VALUE = 0
const MAX_VIBRANCY_VALUE = 3

export const RenderSettings = v.object({
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
  plotsPerChain: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(64)),
    16,
  ),
  autoExposure3D: v.optional(v.boolean(), false),
  autoExposure3DStrength: v.optional(
    v.pipe(v.number(), v.minValue(0), v.maxValue(3)),
    1,
  ),
  autoExposure3DRefRadius: v.optional(v.number(), 5),
  autoExposure3DBase: v.optional(v.number(), 0),
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
  // Cyclic: the colour grading pass reads the phase through fract() and as a
  // rotation angle, so 1.25 is 0.25 (see numberDomain.ts).
  palettePhase: v.optional(
    v.pipe(
      v.number(),
      v.minValue(0),
      v.maxValue(1),
      v.metadata({ cyclic: true }),
    ),
    0,
  ),
  paletteSpeed: v.optional(v.pipe(v.number(), v.minValue(0)), 0.5),
  blendWeight: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  blendFlame: v.optional(v.unknown()),
  palette: v.optional(
    v.object({
      id: v.string(),
      name: v.string(),
      entries: v.array(
        v.object({
          id: v.string(),
          position: v.number(),
          a: v.number(),
          b: v.number(),
        }),
      ),
    }),
  ),
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

export function makeFlameDescriptorSchema<
  TAffine extends typeof AffineParamsSchema | typeof AffineParams3DSchema,
  TVariation extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>> =
    typeof BaseVariationDescriptor,
>(affine: TAffine, variationSchema?: TVariation) {
  const variationRecord = v.record(
    VariationId,
    variationSchema ?? BaseVariationDescriptor,
  )
  const TransformFunction = v.object({
    probability: v.number(),
    preAffine: affine,
    postAffine: affine,
    color: v.object({ x: v.number(), y: v.number() }),
    colorSpeed: v.optional(v.number(), 0.4),
    visible: v.optional(v.boolean(), true),
    variations: variationRecord,
  })
  const TransformRecord = v.record(TransformId, TransformFunction)
  const FlameLayer = v.object({
    id: v.string(),
    name: v.optional(v.string(), 'Layer'),
    visible: v.optional(v.boolean(), true),
    opacity: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 1),
    blendMode: v.optional(
      v.picklist(['normal', 'add', 'multiply', 'screen', 'overlay']),
      'normal',
    ),
    transforms: TransformRecord,
  })
  const FlameDescriptor = v.object({
    version: v.optional(FlameDescriptorVersion),
    metadata: v.optional(FlameMetadata, metadataDefault),
    renderSettings: v.optional(RenderSettings, renderSettingsDefault),
    transforms: TransformRecord,
    finalTransform: v.optional(affine),
    layers: v.optional(v.array(FlameLayer)),
  })
  return { TransformFunction, TransformRecord, FlameDescriptor, FlameLayer }
}

const schema2D = makeFlameDescriptorSchema(AffineParamsSchema)
const schema3D = makeFlameDescriptorSchema(AffineParams3DSchema)

export const TransformFunction = schema2D.TransformFunction
export type TransformFunction = v.InferOutput<typeof TransformFunction>
const TransformRecord = schema2D.TransformRecord
export type TransformRecord = v.InferOutput<typeof TransformRecord>

export const FlameLayer = schema2D.FlameLayer
export type FlameLayer = v.InferOutput<typeof FlameLayer>
export type FlameBlendMode =
  | 'normal'
  | 'add'
  | 'multiply'
  | 'screen'
  | 'overlay'

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

export function validateFlame(data: unknown): FlameDescriptor {
  const complexityError = flameComplexityError(data)
  if (complexityError) throw new Error(complexityError)
  migrateFlameVariationTypes(data)
  const dimensions = (data as { renderSettings?: { dimensions?: number } })
    ?.renderSettings?.dimensions
  if (dimensions === 3) {
    return parseFlame(schema3D.FlameDescriptor, data)
  }
  return parseFlame(schema2D.FlameDescriptor, data)
}

export function validateFlameWithErrors(
  data: unknown,
  errorCallback: (err: string) => void,
): FlameDescriptor | undefined {
  const complexityError = flameComplexityError(data)
  if (complexityError) {
    errorCallback(complexityError)
    return undefined
  }
  migrateFlameVariationTypes(data)
  const dimensions = (data as { renderSettings?: { dimensions?: number } })
    ?.renderSettings?.dimensions
  const schema =
    dimensions === 3 ? schema3D.FlameDescriptor : schema2D.FlameDescriptor
  const result = v.safeParse(schema, data)
  if (!result.success) {
    processValibotErrors(v.flatten(result.issues), errorCallback)
    return undefined
  }
  return result.output
}

export function validateFlame3D(data: unknown): FlameDescriptor3D {
  const complexityError = flameComplexityError(data)
  if (complexityError) throw new Error(complexityError)
  migrateFlameVariationTypes(data)
  return parseFlame(schema3D.FlameDescriptor, data)
}

export function tryValidateFlame(data: unknown): FlameDescriptor | undefined {
  if (flameComplexityError(data)) return undefined
  migrateFlameVariationTypes(data)
  const dimensions = (data as { renderSettings?: { dimensions?: number } })
    ?.renderSettings?.dimensions
  const result =
    dimensions === 3
      ? v.safeParse(schema3D.FlameDescriptor, data)
      : v.safeParse(schema2D.FlameDescriptor, data)
  if (!result.success) return undefined
  return result.output
}

export function condenseFlameDescriptor(
  descriptor: FlameDescriptor,
): FlameDescriptor {
  const condensed = pureClone(descriptor)
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
