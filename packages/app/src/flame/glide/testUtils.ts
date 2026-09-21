/**
 * Flame fixtures for the glide suites.
 *
 * Everything goes through `validateFlame`, so a fixture is exactly the shape
 * the app would hand the planner — schema defaults filled in, nothing invented.
 */

import { renderSettingsDefault, validateFlame, } from '@/flame/schema/flameSchema'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

export type AffineSpec = Partial<{
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}>

export type VariationSpec = {
  type?: string
  weight?: number
  visible?: boolean
  params?: Record<string, number>
}

export type TransformSpec = {
  probability?: number
  preAffine?: AffineSpec
  postAffine?: AffineSpec
  color?: { x: number; y: number }
  colorSpeed?: number
  visible?: boolean
  variations?: Record<string, VariationSpec>
}

export type FlameSpec = {
  transforms: Record<string, TransformSpec>
  renderSettings?: Record<string, unknown>
  finalTransform?: AffineSpec
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
const IDENTITY_3D = {
  a: 1,
  b: 0,
  c: 0,
  d: 0,
  e: 1,
  f: 0,
  g: 0,
  h: 0,
  i: 0,
  j: 0,
  k: 1,
  l: 0,
}

function affine(
  spec: AffineSpec | undefined,
  dimensions: number,
): Record<string, number> {
  const base = dimensions === 3 ? IDENTITY_3D : IDENTITY
  return { ...base, ...(spec ?? {}) }
}

export function makeFlame(spec: FlameSpec): FlameDescriptor {
  const ids = Object.keys(spec.transforms)
  // A partial `renderSettings` is how a caller says "the defaults, but gamma
  // is 4" — the schema requires exposure and skipIters, so merge rather than
  // hand valibot half an object.
  const renderSettings = {
    ...renderSettingsDefault,
    ...(spec.renderSettings ?? {}),
  } as Record<string, unknown>
  const dimensions =
    typeof renderSettings.dimensions === 'number'
      ? renderSettings.dimensions
      : 2
  const transforms: Record<string, unknown> = {}
  for (const [id, transform] of Object.entries(spec.transforms)) {
    const variations: Record<string, unknown> = {}
    const variationSpecs = transform.variations ?? {
      [`v_${id}`]: { type: 'linearVar', weight: 1 },
    }
    for (const [vid, variation] of Object.entries(variationSpecs)) {
      variations[vid] = {
        type: variation.type ?? 'linearVar',
        weight: variation.weight ?? 1,
        ...(variation.visible === undefined
          ? {}
          : { visible: variation.visible }),
        ...(variation.params === undefined
          ? {}
          : { params: { ...variation.params } }),
      }
    }
    transforms[id] = {
      probability: transform.probability ?? 1 / Math.max(1, ids.length),
      preAffine: affine(transform.preAffine, dimensions),
      postAffine: affine(transform.postAffine, dimensions),
      color: transform.color ?? { x: 0.5, y: 0.5 },
      ...(transform.colorSpeed === undefined
        ? {}
        : { colorSpeed: transform.colorSpeed }),
      ...(transform.visible === undefined
        ? {}
        : { visible: transform.visible }),
      variations,
    }
  }
  return validateFlame({
    version: '1.0',
    transforms,
    renderSettings,
    ...(spec.finalTransform === undefined
      ? {}
      : { finalTransform: affine(spec.finalTransform, dimensions) }),
  })
}

/** Σ of the probabilities the chaos game would actually use. */
export function probabilitySumOf(flame: FlameDescriptor): number {
  let sum = 0
  for (const transform of Object.values(
    flame.transforms as unknown as Record<
      string,
      { probability: number; visible?: boolean }
    >,
  )) {
    if (transform.visible === false) continue
    sum += Math.max(0, transform.probability)
  }
  return sum
}

/** Determinant of a transform's pre-affine linear part. */
export function preAffineDeterminant(
  flame: FlameDescriptor,
  id: string,
): number {
  const transform = (
    flame.transforms as unknown as Record<
      string,
      { preAffine: Record<string, number> }
    >
  )[id]
  if (!transform) return Number.NaN
  const { a, b, d, e } = transform.preAffine
  return a! * e! - b! * d!
}
