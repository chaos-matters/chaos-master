import { tgpu } from 'typegpu'
import { f32, struct, vec2f } from 'typegpu/data'
import { recordEntries } from '@/utils/record'
import { sum } from '@/utils/sum'
import { transformVariations } from './variations'
import {
  AffineParams,
  Point,
  transformAffine,
  VariationInfo,
} from './variations/types'
import type { DrawMode } from './drawMode'
import type {
  TransformVariation,
  TransformVariationDescriptor,
} from './variations'

type TransformId = string & { __brand: 'TransformId' }
type VariationId = string & { __brand: 'VariationId' }
export type TransformRecord = Record<TransformId, TransformFunction>
export type VariationRecord = Record<VariationId, TransformVariationDescriptor>

export type RenderSettings = {
  exposure: number
  skipIters: number
  drawMode: DrawMode
  backgroundColor?: [number, number, number]
}

export type TransformFunction = {
  probability: number
  preAffine: AffineParams
  postAffine: AffineParams
  color: { x: number; y: number }
  variations: VariationRecord
}

export type FlameDescriptor = {
  renderSettings: RenderSettings
  transforms: TransformRecord
}

const FlameUniformsBase = struct({
  probability: f32,
  preAffine: AffineParams,
  postAffine: AffineParams,
  color: vec2f,
}).$name('FlameUniformsBase')

const VariantUniformsBase = struct({
  weight: f32,
}).$name('VariantUniformsBase')

function variationUniforms(name: TransformVariation) {
  const tf = transformVariations[name]
  if (tf.type === 'parametric') {
    return struct({
      ...VariantUniformsBase.propTypes,
      params: tf.paramShema,
    }).$name(`VariationUniforms_${name}`)
  }
  return VariantUniformsBase
}

function variationInvocation(name: TransformVariation, vid: VariationId) {
  switch (transformVariations[name].type) {
    case 'simple':
      return `${name}(pre, VariationInfo(uniforms.variation${vid}.weight, uniforms.preAffine))`
    case 'parametric':
      return `${name}(pre, VariationInfo(uniforms.variation${vid}.weight, uniforms.preAffine), uniforms.variation${vid}.params)`
  }
}

export function generateTransformId(): TransformId {
  return window.crypto.randomUUID().replaceAll('-', '_') as TransformId
}

export function generateVariationId(): VariationId {
  return window.crypto.randomUUID().replaceAll('-', '_') as VariationId
}

export function createFlameWgsl({
  variations,
}: Pick<TransformFunction, 'variations'>) {
  const Uniforms = struct({
    ...FlameUniformsBase.propTypes,
    ...Object.fromEntries(
      Object.entries(variations).map(([vid, v]) => [
        `variation${vid}`,
        variationUniforms(v.type),
      ]),
    ),
  }).$name(`FlameUniforms`)
  const fnImpl = tgpu['~unstable'].fn([Point, Uniforms], Point)/* wgsl */ `
    (point: Point, uniforms: Uniforms) -> Point {
      let pre = transformAffine(uniforms.preAffine, point.position);
      var p = vec2f(0);
      ${recordEntries(variations)
        .map(
          ([vid, { type }]) => /* wgsl */ `
            p += uniforms.variation${vid}.weight * ${variationInvocation(type, vid)};`,
        )
        .join('\n')}
      p = transformAffine(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, 0.4);
      return Point(p, color, point.seed);
    }
  `.$uses({
    transformAffine,
    ...Object.fromEntries(
      Object.values(variations).map((v) => [
        v.type,
        transformVariations[v.type].fn,
      ]),
    ),
    VariationInfo,
  })
  return {
    Uniforms,
    fnImpl,
  }
}

export function extractFlameUniforms({
  transforms,
}: Pick<FlameDescriptor, 'transforms'>) {
  const totalProbability = sum(
    Object.values(transforms).map((tr) => tr.probability),
  )
  return Object.fromEntries(
    recordEntries(transforms).map(
      ([tid, { variations, probability, color, ...transform }]) => [
        `flame${tid}`,
        {
          probability: probability / totalProbability,
          color: vec2f(color.x, color.y),
          ...transform,
          ...Object.fromEntries(
            recordEntries(variations).map(
              ([vid, { type: _, ...variation }]) => [
                `variation${vid}`,
                variation,
              ],
            ),
          ),
        },
      ],
    ),
  )
}
