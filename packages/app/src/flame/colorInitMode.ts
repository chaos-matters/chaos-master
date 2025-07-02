import { tgpu } from 'typegpu'
import { vec2f } from 'typegpu/data'
import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'
import type { TgpuFn } from 'typegpu'
import type { Vec2f } from 'typegpu/data'

export type ColorInitModeFn = TgpuFn<[Vec2f], Vec2f>
const colorInitModeFn = tgpu['~unstable'].fn([vec2f], vec2f)
export const colorInitModeZero = colorInitModeFn(
  /* wgsl */ ` (pos: vec2f) -> vec2f { return vec2f(0, 0); }`,
)

export const colorInitModePosition = colorInitModeFn(
  /* wgsl */ `(pos: vec2f) -> vec2f { return pos; }`,
)

export const colorInitModeToImplFn = {
  colorInitZero: colorInitModeZero,
  colorInitPosition: colorInitModePosition,
}

export type ColorInitMode = v.InferOutput<typeof ColorInitMode>
export const ColorInitMode = v.picklist(recordKeys(colorInitModeToImplFn))
