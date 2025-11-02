import { tgpu } from 'typegpu'
import { f32, struct, vec2f } from 'typegpu/data'
import * as v from '@/valibot'

export const AffineParamsSchema = v.object({
  a: v.number(),
  b: v.number(),
  c: v.number(),
  d: v.number(),
  e: v.number(),
  f: v.number(),
})

export type AffineParams = v.InferOutput<typeof AffineParamsSchema>
export const AffineParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f: f32,
})

export const transformAffine = tgpu.fn(
  [AffineParams, vec2f],
  vec2f,
)((T, p) => {
  return vec2f(T.a * p.x + T.b * p.y + T.c, T.d * p.x + T.e * p.y + T.f)
})
