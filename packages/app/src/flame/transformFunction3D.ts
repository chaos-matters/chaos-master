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
import type { AffineLayout } from '@/arcade/affineTerms'

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

/**
 * The registered 2D types the 3D pipeline replaces with a 3D analog; every
 * other 2D type renders as itself, lifted with the point's z. This is how a
 * 2D flame has always rendered in 3D.
 *
 * Every key is a registered 2D type and every value a registered 3D type
 * (flame/variationResolution.test.ts): before v1.0.0 the app keeps no row for
 * a name it does not produce, so a flame that holds one draws nothing for it.
 *
 * The Flame Clash converts its 2D fighters by a rule of its own
 * (flame/clash/convert2Dto3D.ts), which reads the analogs here and never
 * changes the table.
 */
export const VARIATION_2D_TO_3D_MAP: Record<string, TransformVariationType3D> =
  {
    bubbleVar: 'bubble3D',
    cylinderVar: 'cylinder3D',
    cylinder2Var: 'cylindrical3D',
    cylinderApoVar: 'cylinder3D',
    gaussianVar: 'gaussian3D',
    blurVar: 'blur3D',
    squareVar: 'square3D',
    scryVar: 'scry3D',
    crossVar: 'cross3D',
    curlVar: 'curl3D',
    pdjVar: 'pdj3D',
  }

/**
 * The type the 3D pipeline runs for a variation of `type`, or undefined when
 * it skips the variation, as it skips any name neither registry holds: a 3D
 * type as itself, and a 2D type through VARIATION_2D_TO_3D_MAP or else as
 * itself. A transform `from2D`, a Flame Clash 2D fighter's, bypasses the map:
 * each 2D variation runs its own 2D function in the plane.
 *
 * Own keys only, as in the 2D path: `in` also finds 'constructor' and the
 * rest of what a plain object inherits. Everything downstream only sees what
 * this returns.
 */
export function resolveVariationType3D(
  type: string,
  from2D = false,
): string | undefined {
  if (isVariationType3D(type)) return type
  if (!Object.hasOwn(transformVariations, type)) return undefined
  if (!from2D && Object.hasOwn(VARIATION_2D_TO_3D_MAP, type)) {
    return VARIATION_2D_TO_3D_MAP[type]
  }
  return type
}

export function createFlameWgsl3D({
  variations,
  from2D,
}: Pick<TransformFunction, 'variations' | 'from2D'>) {
  const validRecord: Record<string, { type: string }> = {}
  for (const [vid, v] of Object.entries(variations)) {
    const resolved = resolveVariationType3D(v.type, from2D)
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

/**
 * Any affine as the 3D kernel's twelve numbers, read in `layout`: in the 3D
 * layout with its missing fields at the identity's, in the 2D one lifted (its
 * translation `c`, `f` into `d`, `h`, and z passed through unchanged), and
 * none at all as the identity. `layout` defaults to the one the 3D renderer
 * reads the affine in; a 2D flame's renderer reads every affine in the 2D one
 * (affineLayoutOf in arcade/affineTerms.ts). The 3D pipeline writes a flame's
 * final transform through this, and the Flame Clash lifts each fighter's
 * affines with it.
 */
export function toAffine3D(
  affine: Record<string, number | undefined> | undefined,
  layout: AffineLayout = isAffine3D(affine) ? '3D' : '2D',
): AffineParams3D {
  const ft = affine ?? {}
  const at = (key: string, missing: number) => ft[key] ?? missing
  if (layout === '3D') {
    return {
      a: at('a', 1),
      b: at('b', 0),
      c: at('c', 0),
      d: at('d', 0),
      e: at('e', 0),
      f: at('f', 1),
      g: at('g', 0),
      h: at('h', 0),
      i: at('i', 0),
      j: at('j', 0),
      k: at('k', 1),
      l: at('l', 0),
    }
  }
  return {
    a: at('a', 1),
    b: at('b', 0),
    c: 0,
    d: at('c', 0), // Translation X
    e: at('d', 0),
    f: at('e', 1),
    g: 0,
    h: at('f', 0), // Translation Y
    i: 0,
    j: 0,
    k: 1,
    l: 0,
  }
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
          from2D,
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
              a: Number.isFinite(aff.a) ? (aff.a ?? 1) : 1,
              b: Number.isFinite(aff.b) ? (aff.b ?? 0) : 0,
              c: Number.isFinite(aff.c) ? (aff.c ?? 0) : 0,
              d: Number.isFinite(aff.d) ? (aff.d ?? 0) : 0,
              e: Number.isFinite(aff.e) ? (aff.e ?? 0) : 0,
              f: Number.isFinite(aff.f) ? (aff.f ?? 1) : 1,
              g: Number.isFinite(aff.g) ? (aff.g ?? 0) : 0,
              h: Number.isFinite(aff.h) ? (aff.h ?? 0) : 0,
              i: Number.isFinite(aff.i) ? (aff.i ?? 0) : 0,
              j: Number.isFinite(aff.j) ? (aff.j ?? 0) : 0,
              k: Number.isFinite(aff.k) ? (aff.k ?? 1) : 1,
              l: Number.isFinite(aff.l) ? (aff.l ?? 0) : 0,
            }
          }
          // Correct mapping from 2D parameter keys a-f to 3D matrix elements a-l
          return {
            a: Number.isFinite(aff.a) ? (aff.a ?? 1) : 1,
            b: Number.isFinite(aff.b) ? (aff.b ?? 0) : 0,
            c: 0,
            d: Number.isFinite(aff.c) ? (aff.c ?? 0) : 0, // Translation X
            e: Number.isFinite(aff.d) ? (aff.d ?? 0) : 0,
            f: Number.isFinite(aff.e) ? (aff.e ?? 1) : 1,
            g: 0,
            h: Number.isFinite(aff.f) ? (aff.f ?? 0) : 0, // Translation Y
            i: 0,
            j: 0,
            k: 1,
            l: 0,
          }
        }

        return [
          `flame${tid}`,
          {
            probability: isVisible
              ? (Number.isFinite(probability) ? probability : 0) /
                totalProbability
              : 0,
            color: vec2f(
              Number.isFinite(color?.x) ? (color?.x ?? 0) : 0,
              Number.isFinite(color?.y) ? (color?.y ?? 0) : 0,
            ),
            colorSpeed: Number.isFinite(colorSpeed) ? (colorSpeed ?? 0.4) : 0.4,
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
                    resolveVariationType3D(vtype, from2D) !== undefined
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
                  const rawWeight = Number.isFinite(rest.weight)
                    ? rest.weight
                    : 1
                  const typed: Record<string, unknown> = {
                    weight: isVarVisible ? rawWeight : 0,
                  }
                  const variationType = resolveVariationType3D(_type, from2D)!
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
                        if (val !== undefined && Number.isFinite(val)) {
                          safe[key] = val
                        }
                      }
                    }
                    typed.params = safe
                  } else {
                    if (rest.params) {
                      const safe: Record<string, number> = {}
                      for (const [key, val] of Object.entries(rest.params)) {
                        if (Number.isFinite(val)) safe[key] = val
                      }
                      typed.params = safe
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
