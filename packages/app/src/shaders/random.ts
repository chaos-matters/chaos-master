import { tgpu } from 'typegpu'
import { f32, u32, vec2f, vec4u } from 'typegpu/data'
import { PI } from '@/flame/constants'

export const randomState = tgpu.privateVar(vec4u, vec4u(0, 0, 0, 0))

const tausStep = tgpu.fn([u32, u32, u32, u32, u32], u32) /* wgsl */ `
  (z: u32, S1: u32, S2: u32, S3: u32, M: u32) -> u32 {
    let b = ((z << S1) ^ z) >> S2;
    return (((z & M) << S3) ^ b);
  }
`

const lcgStep = tgpu.fn([u32, u32, u32], u32) /* wgsl */ `
  (z: u32, A: u32, C: u32) -> u32 {
    return (A * z + C);
  }
`

export const setSeed = tgpu.fn([vec4u]) /* wgsl */ `
  (newRandomState: vec4u) {
    randomState = newRandomState;
  }
`.$uses({ randomState })

export const random = tgpu.fn([], f32) /* wgsl */ `
  () -> f32 {
    let x = tausStep(s.x, 13, 19, 12, 4294967294);
    let y = tausStep(s.y, 2, 25, 4, 4294967288);
    let z = tausStep(s.z, 3, 11, 17, 4294967280);
    let w = lcgStep(s.w, 1664525, 1013904223);
    setSeed(vec4u(x, y, z, w));

    let a = x ^ y ^ z ^ w;
    return bitcast<f32>((a & 0x007FFFFF) | 0x3F800000) - 1.0;
  }
`.$uses({ s: randomState, setSeed, tausStep, lcgStep })

export const hash = tgpu.fn([u32], u32) /* wgsl */ `
  (i: u32) -> u32 {
    var x = i ^ (i >> 17);
    x *= 0xed5ad4bbu;
    x ^= x >> 11;
    x *= 0xac4c1b51u;
    x ^= x >> 15;
    x *= 0x31848babu;
    x ^= x >> 14;
    return x;
  }
`
export const randomUnitDisk = tgpu.fn([], vec2f) /* wgsl */ `
  () -> vec2f {
    let r = sqrt(random());
    let theta = random() * 2 * PI;
    return r * vec2f(cos(theta), sin(theta));
  }
`.$uses({ random, PI })
