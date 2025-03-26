import tgpu, { TgpuFn } from 'typegpu'
import { f32, F32 } from 'typegpu/data'

export type DrawModeFn = TgpuFn<[F32], F32>
const drawModeFn = tgpu['~unstable'].fn([f32], f32)

export const lightMode = drawModeFn.does(
  /* wgsl */ ` (x: f32) -> f32 { return clamp(x, 0, 1); }`,
)

export const paintMode = drawModeFn.does(
  /* wgsl */ `(x: f32) -> f32 { return 1 - clamp(x, 0, 1); }`,
)
