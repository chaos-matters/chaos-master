import { tgpu } from 'typegpu'
import { f32, struct, vec2f } from 'typegpu/data'
import { recordEntries } from '@/utils/record'
import { sum } from '@/utils/sum'
import { AffineParams, transformAffine } from './affineTranform'
import { Point } from './types'
import { isParametricVariationType, transformVariations } from './variations'
import { VariationInfo } from './variations/simple/types'
import type {
  FlameDescriptor,
  TransformFunction,
  TransformId,
  VariationId,
} from './schema/flameSchema'
import type { TransformVariationType } from './variations'

const FlameUniformsBase = struct({
  probability: f32,
  preAffine: AffineParams,
  postAffine: AffineParams,
  color: vec2f,
}).$name('FlameUniformsBase')

const VariantUniformsBase = struct({
  weight: f32,
}).$name('VariantUniformsBase')

function variationUniforms(variationType: TransformVariationType) {
  if (isParametricVariationType(variationType)) {
    return struct({
      ...VariantUniformsBase.propTypes,
      params: transformVariations[variationType].paramStruct,
    }).$name(`VariationUniforms_${variationType}`)
  }
  return VariantUniformsBase
}

function variationInvocation(
  variationType: TransformVariationType,
  vid: VariationId,
) {
  if (isParametricVariationType(variationType)) {
    return `${variationType}(pre, VariationInfo(uniforms.variation${vid}.weight, uniforms.preAffine), uniforms.variation${vid}.params)`
  }
  return `${variationType}(pre, VariationInfo(uniforms.variation${vid}.weight, uniforms.preAffine))`
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
      return Point(p, color);
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
