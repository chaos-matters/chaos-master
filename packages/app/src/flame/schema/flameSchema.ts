import { deepClone } from '@/utils/clone'
import { prettyPrintValibotErrors, processValibotErrors, } from '@/utils/prettyPrintValibotErrors'
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
const MAX_SKIP_ITERS_VALUE = 30
const MIN_EXPOSURE_VALUE = -8
const MAX_EXPOSURE_VALUE = 8
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

// These limits are a renderer boundary, not merely an import convenience.
// Every transform and variation becomes TypeGPU/WGSL structure, so accepting
// an unbounded descriptor lets a small session file trigger a very large
// shader compile. Keep one shared budget for imports, replay and incremental
// editor commands.
export const MAX_FLAME_TRANSFORMS = 128
export const MAX_VARIATIONS_PER_TRANSFORM = 32
export const MAX_FLAME_VARIATIONS = 512
export const MAX_FLAME_ENTITY_ID_LENGTH = 128

const FORBIDDEN_ENTITY_IDS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Entity ids are interpolated into generated TypeGPU/WGSL member names and
 * used as plain-object keys. Restrict them to the format produced by the app
 * (UUIDs with underscores, including the reserved `_sym__` prefix) so neither
 * prototype keys nor source punctuation can cross that boundary.
 */
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

/** Fast, allocation-light preflight before migration or schema parsing. */
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
  roll: v.optional(v.number(), camera3DDefault.roll),
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
  // Points each chaos-game chain plots after its warmup. 16 = throughput (the
  // plotted points span many convergence depths, so skipIters reads as
  // cosmetic); 1 restores the classic behavior where skipIters fully controls
  // the plotted convergence (slower — each chain contributes one point at depth
  // skipIters).
  plotsPerChain: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(64)),
    16,
  ),
  // 3D auto-exposure: when on, dampen exposure as the camera zooms in (radius
  // shrinks) so the flame doesn't blow out. Reference radius is captured when
  // the toggle is enabled (neutral at that zoom); strength scales the effect.
  autoExposure3D: v.optional(v.boolean(), false),
  autoExposure3DStrength: v.optional(
    v.pipe(v.number(), v.minValue(0), v.maxValue(3)),
    1,
  ),
  autoExposure3DRefRadius: v.optional(v.number(), 5),
  // Exposure (stops) captured when the auto toggle was enabled — the value the
  // zoom-driven Exposure is offset from.
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
  palettePhase: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0),
  paletteSpeed: v.optional(v.pipe(v.number(), v.minValue(0)), 0.5),
  // Blend composition travels with the flame: the mix weight and the blended
  // flame itself. The blend flame is stored as plain data (`unknown`) and
  // re-validated with tryValidateFlame at read time — a recursive schema
  // would complicate the 2D/3D factory for no safety gain.
  blendWeight: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  blendFlame: v.optional(v.unknown()),
  // The applied palette travels WITH the flame (entries embedded, not just an
  // id) so selection is undoable through flame history and survives
  // save/share/load even when the recipient lacks the palette locally.
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

/**
 * Like {@link validateFlame} but collects errors via callback instead of
 * throwing. Returns `undefined` on failure so the caller can show inline
 * diagnostics (e.g. the Migration modal).
 */
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
  // Mirror validateFlame's soundness for recent/stored flames: migrate
  // renamed variation types so older saves still parse, and dispatch to the 3D
  // schema for 3D flames so their a–l affines survive instead of being dropped
  // or stripped to 2D. Failure still returns undefined (caller drops the entry).
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
