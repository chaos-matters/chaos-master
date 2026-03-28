import { tgpu } from 'typegpu'
import { vec2f } from 'typegpu/data'
import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'
import type { TgpuFn } from 'typegpu'
import type { Vec2f } from 'typegpu/data'

// todo: unused?
export type ColorInitModeFn = TgpuFn<(pos: Vec2f) => Vec2f>

const colorInitModeFn = tgpu.fn([vec2f], vec2f)
export const colorInitModeZero = colorInitModeFn(() => {
  'use gpu'
  return vec2f(0)
})

export const colorInitModePosition = colorInitModeFn((pos) => {
  'use gpu'
  return vec2f(pos)
})

export const colorInitModeToImplFn = {
  colorInitZero: colorInitModeZero,
  colorInitPosition: colorInitModePosition,
}

export type ColorInitMode = v.InferOutput<typeof ColorInitMode>
export const ColorInitMode = v.picklist(recordKeys(colorInitModeToImplFn))
