import tgpu, { TgpuFn } from 'typegpu'
import {
  AnyWgslData,
  f32,
  Infer,
  struct,
  Vec2f,
  vec2f,
  vec4u,
} from 'typegpu/data'

export type SimpleVariation = {
  type: 'simple'
  fn: TgpuFn<[Vec2f], Vec2f>
}

export type DependentVariation = {
  type: 'dependent'
  fn: TgpuFn<[Vec2f, typeof AffineParams], Vec2f>
}

export type ParametricVariation<T extends AnyWgslData> = {
  type: 'parametric'
  paramShema: T
  fn: TgpuFn<[Vec2f, T], Vec2f>
}

export const simpleVariation = (
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): SimpleVariation => ({
  type: 'simple',
  fn: tgpu['~unstable'].fn([vec2f], vec2f).does(wgsl).$uses(dependencyMap),
})

export const dependentVariation = (
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): DependentVariation => ({
  type: 'dependent',
  fn: tgpu['~unstable']
    .fn([vec2f, AffineParams], vec2f)
    .does(wgsl)
    .$uses(dependencyMap),
})

export const parametricVariation = <T extends AnyWgslData>(
  paramShema: T,
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): ParametricVariation<T> => ({
  type: 'parametric',
  paramShema,
  fn: tgpu['~unstable']
    .fn([vec2f, paramShema], vec2f)
    .does(wgsl)
    .$uses(dependencyMap),
})

export const Point = struct({
  position: vec2f,
  /** OkLab a and b. */
  color: vec2f,
  seed: vec4u,
})

export const outputTextureFormat = 'rgba32float'

export type AffineParams = Infer<typeof AffineParams>
// prettier-ignore
export const AffineParams = struct({
  a: f32, b: f32, c: f32,
  d: f32, e: f32, f: f32
})

export const transformAffine = tgpu['~unstable'].fn(
  [AffineParams, vec2f],
  vec2f,
).does(/* wgsl */ `
  (T: AffineParams, p: vec2f) -> vec2f {
    return vec2f(
      T.a * p.x + T.b * p.y + T.c,
      T.d * p.x + T.e * p.y + T.f
    );
  }`)
