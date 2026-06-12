import { tgpu } from 'typegpu'
import { f32, struct, vec2f } from 'typegpu/data'
import { recordEntries } from '@/utils/record'
import { sum } from '@/utils/sum'
import { AffineParams, transformAffine } from './affineTranform'
import { Point } from './types'
import { isParametricVariationType, transformVariations } from './variations'
import { VariationInfo } from './variations/simple/types'
import { isVariationType3D } from './variations3D'
import type { BaseData as _BaseData, WgslStruct } from 'typegpu/data'
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
    const v = transformVariations[variationType] as {
      paramStruct: WgslStruct
    }
    return struct({
      ...VariantUniformsBase.propTypes,
      params: v.paramStruct,
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
  // Membership in the 2D registry, not isVariationType: that helper also
  // accepts 3D type names, which have no 2D implementation to resolve.
  const validVariations = Object.fromEntries(
    Object.entries(variations).filter(([, v]) => {
      if (v.type in transformVariations) return true
      if (!isVariationType3D(v.type)) {
        console.warn(
          `[createFlameWgsl] skipping unsupported variation type "${v.type}"`,
        )
      }
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
      var p = vec2f(0.0);
      ${recordEntries(validVariations)
        .map(
          ([vid, { type }]) => /* wgsl */ `
            p += ${variationInvocation(type, vid)};`,
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
        transformVariations[v.type]!.fn,
      ]),
    ),
    // Only referenced by variation invocations — listing it with zero valid
    // variations triggers an "external wasn't used" warning at resolution.
    ...(Object.keys(validVariations).length > 0 ? { VariationInfo } : {}),
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
        {
          variations,
          probability,
          color,
          preAffine,
          postAffine,
          visible,
          colorSpeed,
        },
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
                  // Must mirror the createFlameWgsl filter — the uniform
                  // buffer layout has to match the generated struct.
                  return vtype !== undefined && vtype in transformVariations
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
                  const variationType = type
                  const isParametric = isParametricVariationType(variationType)
                  if (isParametric) {
                    const v = transformVariations[variationType] as { paramDefaults: Record<string, number> }
                    const defaults = v.paramDefaults
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
