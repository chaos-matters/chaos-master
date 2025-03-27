import { f32, struct, vec2f } from 'typegpu/data'
import {
  TransformVariation,
  TransformVariationDescriptor,
  transformVariations,
} from './variations/index'
import { AffineParams, Point, transformAffine } from './variations/types'
import tgpu from 'typegpu'
import { sum } from '@/utils/sum'

export type FlameFunction = {
  probability: number
  preAffine: AffineParams
  postAffine: AffineParams
  color: { x: number; y: number }
  variations: TransformVariationDescriptor[]
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

function variationInvocation(name: TransformVariation, j: number) {
  switch (transformVariations[name].type) {
    case 'simple':
      return `${name}(pre)`
    case 'dependent':
      return `${name}(pre, uniforms.preAffine)`
    case 'parametric':
      return `${name}(pre, uniforms.variation${j}.params)`
  }
}

export function createFlameWgsl({
  variations,
}: Pick<FlameFunction, 'variations'>) {
  const Uniforms = struct({
    ...FlameUniformsBase.propTypes,
    ...Object.fromEntries(
      variations.map((v, j) => [`variation${j}`, variationUniforms(v.type)]),
    ),
  }).$name(`FlameUniforms`)
  const fnImpl = tgpu['~unstable']
    .fn([Point, Uniforms], Point)
    .does(
      /* wgsl */ `
      (point: Point, uniforms: Uniforms) -> Point {
        let pre = transformAffine(uniforms.preAffine, point.position);
        var p = vec2f(0);
        ${variations
          .map(
            ({ type }, j) =>
              /* wgsl */ `p += uniforms.variation${j}.weight * ${variationInvocation(type, j)};`,
          )
          .join('\n')}
        p = transformAffine(uniforms.postAffine, p);
        let color = mix(point.color, uniforms.color, 0.4);
        return Point(p, color, point.seed);
      }
    `,
    )
    .$uses({
      transformAffine,
      ...Object.fromEntries(
        variations.map((v) => [v.type, transformVariations[v.type].fn]),
      ),
    })
  return {
    Uniforms,
    fnImpl,
  }
}

export function extractFlameUniforms(flames: FlameFunction[]) {
  const totalProbability = sum(flames.map((f) => f.probability))
  return Object.fromEntries(
    flames.map(({ variations, probability, color, ...flame }, i) => [
      `flame${i}`,
      {
        probability: probability / totalProbability,
        color: vec2f(color.x, color.y),
        ...flame,
        ...Object.fromEntries(
          variations.map(({ type: _, ...variation }, j) => [
            `variation${j}`,
            variation,
          ]),
        ),
      },
    ]),
  )
}
