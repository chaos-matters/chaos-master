import { tgpu } from 'typegpu'
import { f32, struct, vec3f } from 'typegpu/data'
import * as v from '@/valibot'

export const AffineParams3DSchema = v.object({
  a: v.number(),
  b: v.number(),
  c: v.number(),
  d: v.number(),
  e: v.number(),
  f: v.number(),
  g: v.number(),
  h: v.number(),
  i: v.number(),
  j: v.number(),
  k: v.number(),
  l: v.number(),
})

export type AffineParams3D = v.InferOutput<typeof AffineParams3DSchema>
export const AffineParams3D = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
  g: f32,
  h: f32,
  i: f32,
  j: f32,
  k: f32,
  l: f32,
}).$name('AffineParams3D')

export const transformAffine3D = tgpu.fn(
  [AffineParams3D, vec3f],
  vec3f,
)((T, p) => {
  return vec3f(
    T.a * p.x + T.b * p.y + T.c * p.z + T.d,
    T.e * p.x + T.f * p.y + T.g * p.z + T.h,
    T.i * p.x + T.j * p.y + T.k * p.z + T.l,
  )
})
