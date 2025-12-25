import { tgpu } from 'typegpu'
import { f32, u32, vec2f, vec4u } from 'typegpu/data'
import { bitcastU32toF32, cos, mul, sin, sqrt } from 'typegpu/std'
import { PI } from '@/flame/constants'

export const randomState = tgpu.privateVar(vec4u, vec4u(0, 0, 0, 0))

const tausStep = tgpu.fn(
  [u32, u32, u32, u32, u32],
  u32,
)((z, S1, S2, S3, M) => {
  const b = ((z << S1) ^ z) >> S2
  return ((z & M) << S3) ^ b
})

const lcgStep = tgpu.fn(
  [u32, u32, u32],
  u32,
)((z, A, C) => {
  return A * z + C
})

export const setSeed = tgpu.fn([vec4u])((newRandomState) => {
  randomState.$ = vec4u(newRandomState);
})

export const random = tgpu.fn(
  [],
  f32,
)(() => {
  const s = randomState.$
  const x = tausStep(s.x, 13, 19, 12, 4294967294)
  const y = tausStep(s.y, 2, 25, 4, 4294967288)
  const z = tausStep(s.z, 3, 11, 17, 4294967280)
  const w = lcgStep(s.w, 1664525, 1013904223)
  setSeed(vec4u(x, y, z, w))

  const a = x ^ y ^ z ^ w
  return bitcastU32toF32((a & 0x007fffff) | 0x3f800000) - 1.0
})

export const hash = tgpu.fn(
  [u32],
  u32,
)((i) => {
  let x = i ^ (i >> 17)
  x *= u32(0xed5ad4bb)
  x ^= x >> 11
  x *= u32(0xac4c1b51)
  x ^= x >> 15
  x *= u32(0x31848bab)
  x ^= x >> 14
  return x
})

export const randomUnitDisk = tgpu.fn(
  [],
  vec2f,
)(() => {
  const r = sqrt(random())
  const theta = random() * 2 * PI.$
  return mul(r, vec2f(cos(theta), sin(theta)))
})
