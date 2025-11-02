import { tgpu } from 'typegpu'
import { f32 } from 'typegpu/data'
import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'
import type { TgpuFn } from 'typegpu'
import type { F32 } from 'typegpu/data'

export type DrawModeFn = TgpuFn<(x: F32) => F32>
const drawModeFn = tgpu.fn([f32], f32)
export const lightMode = drawModeFn(
  /* wgsl */ ` (x: f32) -> f32 { return clamp(x, 0, 1); }`,
)

export const paintMode = drawModeFn(
  /* wgsl */ `(x: f32) -> f32 { return 1 - clamp(x, 0, 1); }`,
)

export const drawModeToImplFn = {
  light: lightMode,
  paint: paintMode,
}

export type DrawMode = v.InferOutput<typeof DrawMode>
export const DrawMode = v.picklist(recordKeys(drawModeToImplFn))
