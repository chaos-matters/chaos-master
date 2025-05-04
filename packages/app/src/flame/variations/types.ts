import { tgpu } from 'typegpu'
import { f32, struct, vec2f, vec4u } from 'typegpu/data'
import type { TgpuFn } from 'typegpu'
import type { AnyWgslData, Infer, Vec2f } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export type AffineParams = Infer<typeof AffineParams>
// prettier-ignore
export const AffineParams = struct({
  a: f32, b: f32, c: f32,
  d: f32, e: f32, f: f32
})

export type VariationInfoType = Infer<typeof VariationInfo>
export const VariationInfo = struct({
  weight: f32,
  affineCoefs: AffineParams,
})

export type SimpleVariation = {
  type: 'simple'
  fn: TgpuFn<[Vec2f, typeof VariationInfo], Vec2f>
}

export type ParametricVariation<T extends AnyWgslData> = {
  type: 'parametric'
  paramShema: T
  paramDefaults: Infer<T>
  editor: EditorFor<Infer<T>> | undefined
  fn: TgpuFn<[Vec2f, typeof VariationInfo, T], Vec2f>
}

export const simpleVariation = (
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): SimpleVariation => ({
  type: 'simple',
  fn: tgpu['~unstable']
    .fn([vec2f, VariationInfo], vec2f)(wgsl)
    .$uses(dependencyMap),
})

export const parametricVariation = <T extends AnyWgslData>(
  paramShema: T,
  paramDefaults: Infer<T>,
  editor: EditorFor<Infer<T>> | undefined,
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): ParametricVariation<T> => ({
  type: 'parametric',
  paramShema,
  paramDefaults,
  editor,
  fn: tgpu['~unstable']
    .fn([vec2f, VariationInfo, paramShema], vec2f)(wgsl)
    .$uses(dependencyMap),
})

export const Point = struct({
  position: vec2f,
  /** OkLab a and b. */
  color: vec2f,
  seed: vec4u,
})

export const outputTextureFormat = 'rgba32float'

export const transformAffine = tgpu['~unstable'].fn(
  [AffineParams, vec2f],
  vec2f,
)/* wgsl */ `
  (T: AffineParams, p: vec2f) -> vec2f {
    return vec2f(
      T.a * p.x + T.b * p.y + T.c,
      T.d * p.x + T.e * p.y + T.f
    );
  }
`
