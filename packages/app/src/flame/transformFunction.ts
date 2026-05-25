import { tgpu } from 'typegpu'
import { f32, struct, vec2f } from 'typegpu/data'
import { recordEntries } from '@/utils/record'
import { sum } from '@/utils/sum'
import { AffineParams, transformAffine } from './affineTranform'
import { Point } from './types'
import { isParametricVariationType, isVariationType, transformVariations, } from './variations'
import { VariationInfo } from './variations/simple/types'
import type { FlameDescriptor, TransformFunction, TransformId, VariationId, } from './schema/flameSchema'
import type { TransformVariationType } from './variations'

const FlameUniformsBase = struct({
  probability: f32,
  preAffine: AffineParams,
  postAffine: AffineParams,
  color: vec2f,
  colorSpeed: f32,
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

export function generateTransformId(identifier: string = ''): TransformId {
  return `_${identifier}__${window.crypto
    .randomUUID()
    .replaceAll('-', '_')}` as TransformId
}

export function generateVariationId(): VariationId {
  return window.crypto.randomUUID().replaceAll('-', '_') as VariationId
}

export function createFlameWgsl({
  variations,
}: Pick<TransformFunction, 'variations'>) {
  const validVariations = Object.fromEntries(
    Object.entries(variations).filter(([, v]) => {
      if (isVariationType(v.type)) return true
      console.warn(
        `[createFlameWgsl] skipping unknown variation type "${v.type}"`,
      )
      return false
    }),
  ) as Record<VariationId, { type: TransformVariationType }>
  const Uniforms = struct({
    ...FlameUniformsBase.propTypes,
    ...Object.fromEntries(
      Object.entries(validVariations).map(([vid, v]) => [
        `variation${vid}`,
        variationUniforms(v.type),
      ]),
    ),
  }).$name(`FlameUniforms`)
  const fnImpl = tgpu.fn([Point, Uniforms], Point) /* wgsl */ `
    (point: Point, uniforms: Uniforms) -> Point {
      let pre = transformAffine(uniforms.preAffine, point.position);
      var p = vec2f(0);
      ${recordEntries(validVariations)
        .map(
          ([vid, { type }]) => /* wgsl */ `
            p += uniforms.variation${vid}.weight * ${variationInvocation(type, vid)};`,
        )
        .join('\n')}
      p = transformAffine(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point(p, color);
    }
  `.$uses({
    transformAffine,
    ...Object.fromEntries(
      Object.values(validVariations).map((v) => [
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
  const visibleTransforms = Object.values(transforms).filter((tr) => tr.visible)
  const totalProbability =
    sum(visibleTransforms.map((tr) => tr.probability)) || 1
  return Object.fromEntries(
    recordEntries(transforms).map(
      ([
        tid,
        { variations, probability, color, preAffine, postAffine, visible, colorSpeed },
      ]) => {
        const isVisible = visible
        return [
          `flame${tid}`,
          {
            probability: isVisible ? probability / totalProbability : 0,
            color: vec2f(color?.x ?? 0, color?.y ?? 0),
            colorSpeed: colorSpeed ?? 0.4,
            preAffine: preAffine
              ? {
                  a: preAffine.a ?? 1,
                  b: preAffine.b ?? 0,
                  c: preAffine.c ?? 0,
                  d: preAffine.d ?? 0,
                  e: preAffine.e ?? 1,
                  f: preAffine.f ?? 0,
                }
              : { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
            postAffine: postAffine
              ? {
                  a: postAffine.a ?? 1,
                  b: postAffine.b ?? 0,
                  c: postAffine.c ?? 0,
                  d: postAffine.d ?? 0,
                  e: postAffine.e ?? 1,
                  f: postAffine.f ?? 0,
                }
              : { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
            ...Object.fromEntries(
              recordEntries(variations ?? {})
                .filter(([, v]) => {
                  const vtype = (v as Record<string, unknown>).type as
                    | string
                    | undefined
                  return vtype !== undefined && isVariationType(vtype)
                })
                .map(([vid, variation]) => {
                  const {
                    type,
                    visible: varVisible,
                    ...rest
                  } = variation as {
                    type: string
                    weight: number
                    visible?: boolean
                    params?: Record<string, number>
                  }
                  const isVarVisible = varVisible !== false
                  const typed: Record<string, unknown> = {
                    weight: isVarVisible ? (rest.weight ?? 1) : 0,
                  }
                  const variationType = type as TransformVariationType
                  const isParametric = isParametricVariationType(variationType)
                  if (isParametric) {
                    const defaults = transformVariations[variationType]
                      .paramDefaults as Record<string, number>
                    const safe: Record<string, number> = { ...defaults }
                    if (rest.params) {
                      for (const key of Object.keys(defaults)) {
                        const val = rest.params[key]
                        if (val !== undefined) {
                          safe[key] = val
                        }
                      }
                    } else {
                      console.warn(
                        `[extractFlameUniforms] params missing for ${variationType}`,
                        'rest keys:',
                        Object.keys(rest),
                        'rest.params:',
                        rest.params,
                      )
                    }
                    typed.params = safe
                  } else {
                    if (rest.params) {
                      typed.params = { ...rest.params }
                    } else if (
                      'params' in (variation as Record<string, unknown>)
                    ) {
                      console.warn(
                        `[extractFlameUniforms] ${variationType} has params but NOT recognized as parametric. rest.params:`,
                        rest.params,
                        'variation.params:',
                        (variation as Record<string, unknown>).params,
                      )
                    }
                  }
                  return [`variation${vid}`, typed]
                }),
            ),
          },
        ]
      },
    ),
  )
}
