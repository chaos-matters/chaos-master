import { tgpu } from 'typegpu'
import { f32 } from 'typegpu/data'
import { max } from 'typegpu/std'
import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'
import type { TgpuFn } from 'typegpu'
import type { F32 } from 'typegpu/data'

export type DrawModeFn = TgpuFn<(x: F32) => F32>
const drawModeFn = tgpu.fn([f32], f32)
export const lightMode = drawModeFn((x) => {
  'use gpu'
  return max(x, 0)
})

export const paintMode = drawModeFn((x) => {
  'use gpu'
  return 1 - max(x, 0)
})

export const drawModeToImplFn = {
  light: lightMode,
  paint: paintMode,
}

export type DrawMode = v.InferOutput<typeof DrawMode>
export const DrawMode = v.picklist(recordKeys(drawModeToImplFn))
