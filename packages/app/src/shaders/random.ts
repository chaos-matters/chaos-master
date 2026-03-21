/**
 * Implements xoroshiro64++ random number generator with vec2u state
 * https://prng.di.unimi.it/xoroshiro64starstar.c
 */

import { tgpu } from 'typegpu'
import { u32, vec2u } from 'typegpu/data'
import { bitcastU32toF32 } from 'typegpu/std'
import type { v2u } from 'typegpu/data'

export const randomState = tgpu.privateVar(vec2u, vec2u(0, 0))

const rotl = tgpu.fn(
  [u32, u32],
  u32,
)((x: number, k: number) => {
  return (x << k) | (x >> (32 - k))
})

export function setSeed(seed: v2u) {
  'use gpu'
  randomState.$ = vec2u(seed)
}

export function next() {
  'use gpu'
  const s0 = randomState.$[0]
  let s1 = randomState.$[1]
  const result = rotl(s0 * 0x9e3779bb, 5) * 5

  s1 ^= s0
  randomState.$[0] = rotl(s0, 26) ^ s1 ^ (s1 << 9) // a, b
  randomState.$[1] = rotl(s1, 13) // c

  return result
}

export function random() {
  'use gpu'
  next()
  const a = randomState.$.x
  return bitcastU32toF32((a & 0x007fffff) | 0x3f800000) - 1.0
}

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
