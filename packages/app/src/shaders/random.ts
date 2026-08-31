/**
 * Implements xoroshiro64** random number generator with vec2u state.
 *
 * The raw state remains local because the renderer persists it between
 * dispatches. The algorithm primitives come from @typegpu/noise, which
 * upstreamed this generator from Chaos Master.
 * https://prng.di.unimi.it/xoroshiro64starstar.c
 */

import { tgpu } from 'typegpu'
import { f32, u32, vec2f, vec2u, vec3f } from 'typegpu/data'
import { acos, bitcastU32toF32, cos, mul, pow, sin, sqrt } from 'typegpu/std'
import { PI } from '@/flame/constants'
import type { v2u } from 'typegpu/data'

export const rotl = tgpu.fn(
  [u32, u32],
  u32,
)((x: number, k: number) => {
  return (x << k) | (x >> (32 - k))
})

export const u32To01F32 = tgpu.fn(
  [u32],
  f32,
)((a: number) => {
  return bitcastU32toF32((a & 0x007fffff) | 0x3f800000) - 1.0
})

export const hash = tgpu.fn(
  [u32],
  u32,
)((i: number) => {
  let x = i ^ (i >> 17)
  x *= u32(0xed5ad4bb)
  x ^= x >> 11
  x *= u32(0xac4c1b51)
  x ^= x >> 15
  x *= u32(0x31848bab)
  x ^= x >> 14
  return x
})

export const RENDERER_RANDOM_IMPLEMENTATION_IDS = {
  canonical: 'xoroshiro64ss-canonical-v1',
  legacy: 'legacy-xoroshiro64-state-x-v1',
} as const

export type RendererRandomImplementationId =
  (typeof RENDERER_RANDOM_IMPLEMENTATION_IDS)[keyof typeof RENDERER_RANDOM_IMPLEMENTATION_IDS]

export const DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID =
  RENDERER_RANDOM_IMPLEMENTATION_IDS.canonical

/**
 * Selects the renderer's historical post-transition output rule.
 *
 * TypeGPU slots are resolved while the pipeline is compiled, so this does not
 * add a runtime branch to the random hot path. The default preserves the
 * current canonical xoroshiro64** sequence for every non-benchmark renderer.
 */
export const legacyRandomOutputSlot = tgpu.slot(false)

export const randomState = tgpu.privateVar(vec2u, vec2u(0, 0))

export function setSeed(seed: v2u) {
  'use gpu'
  randomState.$ = vec2u(seed)
}

export function next() {
  'use gpu'
  const s0 = randomState.$[0]
  let s1 = randomState.$[1]

  s1 ^= s0
  randomState.$[0] = rotl(s0, 26) ^ s1 ^ (s1 << 9) // a, b
  randomState.$[1] = rotl(s1, 13) // c

  return legacyRandomOutputSlot.$
    ? randomState.$[0]
    : rotl(s0 * 0x9e3779bb, 5) * 5
}

export function random() {
  'use gpu'
  return u32To01F32(next())
}

export const randomUnitDisk = tgpu.fn(
  [],
  vec2f,
)(() => {
  const r = sqrt(random())
  const theta = random() * 2 * PI.$
  return mul(r, vec2f(cos(theta), sin(theta)))
})

export const randomUnitSquare = tgpu.fn(
  [],
  vec2f,
)(() => {
  return vec2f(random(), random()).sub(vec2f(0.5, 0.5)).mul(2)
})

const gaussianRandom = () => {
  'use gpu'
  return random() + random() + random() + random() - 2
}

export const randomGaussianDisk = tgpu.fn(
  [],
  vec2f,
)(() => {
  const r =
    gaussianRandom() +
    gaussianRandom() +
    gaussianRandom() +
    gaussianRandom() -
    2
  const theta = random() * 2 * PI.$
  return vec2f(cos(theta), sin(theta)).mul(r)
})

export const randomGaussianSquare = tgpu.fn(
  [],
  vec2f,
)(() => {
  return vec2f(gaussianRandom(), gaussianRandom())
})

export const randomUniformCircle = tgpu.fn(
  [],
  vec2f,
)(() => {
  const r = sqrt(random())
  const theta = random() * 2 * PI.$
  return mul(r, vec2f(cos(theta), sin(theta)))
})

export const randomGaussianCircle = tgpu.fn(
  [],
  vec2f,
)(() => {
  const r =
    gaussianRandom() +
    gaussianRandom() +
    gaussianRandom() +
    gaussianRandom() -
    2
  const theta = random() * 2 * PI.$
  return vec2f(cos(theta), sin(theta)).mul(r)
})

export const randomUnitSphere = tgpu.fn(
  [],
  vec3f,
)(() => {
  const theta = random() * 2 * PI.$
  const phi = acos(2 * random() - 1)
  return mul(
    sqrt(1),
    vec3f(sin(phi) * cos(theta), sin(phi) * sin(theta), cos(phi)),
  )
})

export const randomUnitBall = tgpu.fn(
  [],
  vec3f,
)(() => {
  const theta = random() * 2 * PI.$
  const phi = acos(2 * random() - 1)
  const r = pow(random(), 1.0 / 3.0)
  return mul(r, vec3f(sin(phi) * cos(theta), sin(phi) * sin(theta), cos(phi)))
})
