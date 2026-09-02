import { tgpu } from 'typegpu'
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- vec3f is used in WGSL template literal
import { f32, struct, vec2f, vec3f } from 'typegpu/data'
import { recordEntries } from '@/utils/record'
import { sum } from '@/utils/sum'
import { AffineParams } from './affineTranform'
import { AffineParams3D, transformAffine3D } from './affineTransform3D'
import { Point3D } from './types3D'
import { isParametricVariationType, transformVariations } from './variations'
import { VariationInfo } from './variations/simple/types'
import { VariationInfo3D } from './variations/simple3D/types'
import { isParametricVariationType3D, isVariationType3D, transformVariations3D, } from './variations3D'
import type { WgslStruct } from 'typegpu/data'
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

function variationUniforms3D(variationType: string) {
  if (
    variationType in transformVariations3D &&
    'paramStruct' in
      transformVariations3D[variationType as TransformVariationType3D]
  ) {
    return struct({
      ...VariantUniformsBase3D.propTypes,

      params: (
        transformVariations3D[variationType as TransformVariationType3D] as {
          paramStruct: WgslStruct
        }
      ).paramStruct,
    }).$name(`VariationUniforms3D_${variationType}`)
  }
  if (
    variationType in transformVariations &&
    isParametricVariationType(variationType)
  ) {
    const v = transformVariations[variationType] as { paramStruct: WgslStruct }
    return struct({
      ...VariantUniformsBase3D.propTypes,
      params: v.paramStruct,
    }).$name(`VariationUniforms3D_Fallback_${variationType}`)
  }
  return VariantUniformsBase3D
}

function variationInvocation3D(variationType: string, vid: VariationId) {
  if (variationType in transformVariations3D) {
    if (
      'paramStruct' in
      transformVariations3D[variationType as TransformVariationType3D]
    ) {
      return `${variationType}(pre, VariationInfo3D(uniforms.variation${vid}.weight, uniforms.preAffine), uniforms.variation${vid}.params)`
    }
    return `${variationType}(pre, VariationInfo3D(uniforms.variation${vid}.weight, uniforms.preAffine))`
  }
  if (
    variationType in transformVariations &&
    isParametricVariationType(variationType)
  ) {
    return `${variationType}(vec2f(pre.x, pre.y), VariationInfo(1.0, AffineParams(uniforms.preAffine.a, uniforms.preAffine.b, uniforms.preAffine.d, uniforms.preAffine.e, uniforms.preAffine.f, uniforms.preAffine.h)), uniforms.variation${vid}.params)`
  }
  return `${variationType}(vec2f(pre.x, pre.y), VariationInfo(1.0, AffineParams(uniforms.preAffine.a, uniforms.preAffine.b, uniforms.preAffine.d, uniforms.preAffine.e, uniforms.preAffine.f, uniforms.preAffine.h)))`
}

export const VARIATION_2D_TO_3D_MAP: Record<string, TransformVariationType3D> =
  {
    linear: 'linear3D',
    linearT: 'linear3D',
    spherical: 'spherical3D',
    sinusoidal: 'sinusoidal3D',
    swirl: 'swirl3D',
    swirl3: 'swirl3D',
    horseshoe: 'horseshoe3D',
    polar: 'polar3D',
    polar2: 'polar3D',
    nPolar: 'polar3D',
    handkerchief: 'handkerchief3D',
    heart: 'heart3D',
    disc: 'disc3D',
    spiral: 'spiral3D',
    diamond: 'diamond3D',
    ex: 'ex3D',
    julia: 'julia3D',
    juliaN: 'julia3D',
    juliaScope: 'julia3D',
    bent: 'bent3D',
    waves: 'waves3D',
    fisheye: 'fisheye3D',
    exponential: 'exponential3D',
    power: 'power3D',
    rings: 'rings3D',
    rings2: 'rings3D',
    eyefish: 'eyefish3D',
    bubble: 'bubble3D',
    bubbleVar: 'bubble3D',
    cylinder: 'cylinder3D',
    cylinderVar: 'cylinder3D',
    cylinder2Var: 'cylindrical3D',
    cylindrical: 'cylindrical3D',
    cylinderApoVar: 'cylinder3D',
    gaussian: 'gaussian3D',
    gaussianVar: 'gaussian3D',
    sphere: 'sphere3D',
    sphereVar: 'sphere3D',
    blur: 'blur3D',
    blurVar: 'blur3D',
    square: 'square3D',
    squareVar: 'square3D',
    scry: 'scry3D',
    scryVar: 'scry3D',
    cross: 'cross3D',
    crossVar: 'cross3D',
    curl: 'curl3D',
    curlVar: 'curl3D',
    pdj: 'pdj3D',
    pdjVar: 'pdj3D',
    hemisphere: 'hemisphere3D',
    starfield: 'starfield3D',
  }

export function resolveVariationType3D(type: string): string | undefined {
  if (isVariationType3D(type)) return type
  if (type in VARIATION_2D_TO_3D_MAP) return VARIATION_2D_TO_3D_MAP[type]
  if (type in transformVariations) return type
  return undefined
}

export function createFlameWgsl3D({
  variations,
}: Pick<TransformFunction, 'variations'>) {
  const validRecord: Record<string, { type: string }> = {}
  for (const [vid, v] of Object.entries(variations)) {
    const resolved = resolveVariationType3D(v.type)
    if (!resolved) {
      console.warn(
        `[createFlameWgsl3D] skipping unknown variation type "${v.type}"`,
      )
      continue
    }
    validRecord[vid] = { ...v, type: resolved }
  }
  const validVariations = validRecord as unknown as Record<
    VariationId,
    { type: string }
  >
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
        .map(([vid, { type }]) => {
          if (type in transformVariations3D) {
            return `p += uniforms.variation${vid}.weight * ${variationInvocation3D(type, vid)};`
          }
          return `let r2_${vid} = ${variationInvocation3D(type, vid)};\n      p += uniforms.variation${vid}.weight * vec3f(r2_${vid}.x, r2_${vid}.y, pre.z);`
        })
        .join('\n      ')}
      p = transformAffine3D(uniforms.postAffine, p);
      let color = mix(point.color, uniforms.color, uniforms.colorSpeed);
      return Point3D(p, color);
    }
  `.$uses({
    transformAffine3D,
    ...Object.fromEntries(
      Object.values(validVariations).map((v) => {
        if (v.type in transformVariations3D) {
          return [
            v.type,
            transformVariations3D[v.type as TransformVariationType3D].fn,
          ]
        }
        return [v.type, transformVariations[v.type]!.fn]
      }),
    ),
    // Only referenced by variation invocations — listing with zero valid
    // variations triggers an "external wasn't used" warning at resolution.
    ...(Object.values(validVariations).some(
      (v) => v.type in transformVariations3D,
    )
      ? { VariationInfo3D }
      : {}),
    ...(Object.values(validVariations).some(
      (v) => v.type in transformVariations,
    )
      ? { AffineParams, VariationInfo }
      : {}),
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
                  return (
                    vtype !== undefined &&
                    resolveVariationType3D(vtype) !== undefined
                  )
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
                  const variationType = resolveVariationType3D(_type)!
                  let isParametric = false
                  let defaults: Record<string, number> | undefined

                  if (isParametricVariationType3D(variationType)) {
                    isParametric = true
                    const v = transformVariations3D[variationType]
                    defaults = v.paramDefaults
                  } else if (isParametricVariationType(variationType)) {
                    isParametric = true
                    const v = transformVariations[variationType] as {
                      paramDefaults: Record<string, number>
                    }
                    defaults = v.paramDefaults
                  }

                  if (isParametric && defaults) {
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
