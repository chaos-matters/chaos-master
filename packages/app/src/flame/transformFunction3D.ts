import { tgpu } from 'typegpu'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- vec3f is used in WGSL template literal
import { f32, struct, vec2f, vec3f } from 'typegpu/data'
import { recordEntries } from '@/utils/record'
import { sum } from '@/utils/sum'
import { AffineParams3D, transformAffine3D } from './affineTransform3D'
import { Point3D } from './types3D'
import { VariationInfo3D } from './variations/simple3D/types'
import { isParametricVariationType3D, isVariationType3D, transformVariations3D, } from './variations3D'
import type { FlameDescriptor, TransformFunction, VariationId, } from './schema/flameSchema'
import type { TransformVariationType3D } from './variations3D'

const FlameUniformsBase3D = struct({
  probability: f32,
  preAffine: AffineParams3D,
  postAffine: AffineParams3D,
  color: vec2f,
  colorSpeed: f32,
}).$name('FlameUniformsBase3D')

const VariantUniformsBase3D = struct({
  weight: f32,
}).$name('VariantUniformsBase3D')

function variationUniforms3D(variationType: TransformVariationType3D) {
  if ('paramStruct' in transformVariations3D[variationType]) {
    return struct({
      ...VariantUniformsBase3D.propTypes,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: (transformVariations3D[variationType] as any).paramStruct,
    }).$name(`VariationUniforms3D_${variationType}`)
  }
  return VariantUniformsBase3D
}

function variationInvocation3D(
  variationType: TransformVariationType3D,
  vid: VariationId,
) {
  if ('paramStruct' in transformVariations3D[variationType]) {
    return `${variationType}(pre, VariationInfo3D(uniforms.variation${vid}.weight, uniforms.preAffine), uniforms.variation${vid}.params)`
  }
  return `${variationType}(pre, VariationInfo3D(uniforms.variation${vid}.weight, uniforms.preAffine))`
}

export function createFlameWgsl3D({
  variations,
}: Pick<TransformFunction, 'variations'>) {
  const validVariations = Object.fromEntries(
    Object.entries(variations).filter(([, v]) => {
      if (isVariationType3D(v.type)) return true
      console.warn(
        `[createFlameWgsl3D] skipping unknown variation type "${v.type}"`,
      )
      return false
    }),
  ) as unknown as Record<VariationId, { type: TransformVariationType3D }>
  const Uniforms = struct({
    ...FlameUniformsBase3D.propTypes,
    ...Object.fromEntries(
      Object.entries(validVariations).map(([vid, v]) => [
        `variation${vid}`,
        variationUniforms3D(v.type),
      ]),
    ),
  }).$name(`FlameUniforms3D`)
  const fnImpl = tgpu.fn([Point3D, Uniforms], Point3D) /* wgsl */ `
    (point: Point3D, uniforms: Uniforms) -> Point3D {
      let pre = transformAffine3D(uniforms.preAffine, point.position);
      var p = vec3f(0);
      ${recordEntries(validVariations)
        .map(
          ([vid, { type }]) => /* wgsl */ `
            p += uniforms.variation${vid}.weight * ${variationInvocation3D(type, vid)};`,
        )
        .join('\n')}
      p = transformAffine3D(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point3D(p, color);
    }
  `.$uses({
    transformAffine3D,
    ...Object.fromEntries(
      Object.values(validVariations).map((v) => [
        v.type,
        transformVariations3D[v.type].fn,
      ]),
    ),
    // Only referenced by variation invocations — listing with zero valid
    // variations triggers an "external wasn't used" warning at resolution.
    ...(Object.keys(validVariations).length > 0 ? { VariationInfo3D } : {}),
  })
  return {
    Uniforms,
    fnImpl,
  }
}

export function isAffine3D(
  affine: Record<string, number | undefined> | undefined,
): boolean {
  if (!affine) return false
  return (
    affine.g !== undefined ||
    affine.h !== undefined ||
    affine.i !== undefined ||
    affine.j !== undefined ||
    affine.k !== undefined ||
    affine.l !== undefined
  )
}

export function extractFlameUniforms3D({
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
        const pAffine = preAffine as
          | Record<string, number | undefined>
          | undefined
        const postAff = postAffine as
          | Record<string, number | undefined>
          | undefined

        const mapAffine = (
          aff: Record<string, number | undefined> | undefined,
        ) => {
          if (!aff) {
            return {
              a: 1,
              b: 0,
              c: 0,
              d: 0,
              e: 0,
              f: 1,
              g: 0,
              h: 0,
              i: 0,
              j: 0,
              k: 1,
              l: 0,
            }
          }
          if (isAffine3D(aff)) {
            return {
              a: aff.a ?? 1,
              b: aff.b ?? 0,
              c: aff.c ?? 0,
              d: aff.d ?? 0,
              e: aff.e ?? 0,
              f: aff.f ?? 1,
              g: aff.g ?? 0,
              h: aff.h ?? 0,
              i: aff.i ?? 0,
              j: aff.j ?? 0,
              k: aff.k ?? 1,
              l: aff.l ?? 0,
            }
          }
          // Correct mapping from 2D parameter keys a-f to 3D matrix elements a-l
          return {
            a: aff.a ?? 1,
            b: aff.b ?? 0,
            c: 0,
            d: aff.c ?? 0, // Translation X
            e: aff.d ?? 0,
            f: aff.e ?? 1,
            g: 0,
            h: aff.f ?? 0, // Translation Y
            i: 0,
            j: 0,
            k: 1,
            l: 0,
          }
        }

        return [
          `flame${tid}`,
          {
            probability: isVisible ? probability / totalProbability : 0,
            color: vec2f(color?.x ?? 0, color?.y ?? 0),
            colorSpeed: colorSpeed ?? 0.4,
            preAffine: mapAffine(pAffine),
            postAffine: mapAffine(postAff),
            ...Object.fromEntries(
              recordEntries(variations ?? {})
                .filter(([, v]) => {
                  const vtype = (v as Record<string, unknown>).type as
                    | string
                    | undefined
                  return vtype !== undefined && isVariationType3D(vtype)
                })
                .map(([vid, variation]) => {
                  const {
                    type: _type,
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
                  const variationType =
                    _type as keyof typeof transformVariations3D
                  const isParametric =
                    isParametricVariationType3D(variationType)
                  if (isParametric) {
                    const v = transformVariations3D[variationType]
                    const defaults = v.paramDefaults as Record<string, number>
                    const safe: Record<string, number> = { ...defaults }
                    if (rest.params) {
                      for (const key of Object.keys(defaults)) {
                        const val = rest.params[key]
                        if (val !== undefined) {
                          safe[key] = val
                        }
                      }
                    }
                    typed.params = safe
                  } else {
                    if (rest.params) {
                      typed.params = { ...rest.params }
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
