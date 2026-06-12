import { tgpu } from 'typegpu'
import { f32, struct, vec2f } from 'typegpu/data'
import * as v from '@/valibot'
import { AffineParams } from '../../affineTranform'
import type { TgpuFn } from 'typegpu'
import type { Infer, v2f, Vec2f } from 'typegpu/data'
import type { BooleanSchema, OptionalSchema } from 'valibot'
import type { VariationCategory } from '../categories'

export type VariationInfo = Infer<typeof VariationInfo>
export const VariationInfo = struct({
  weight: f32,
  affineCoefs: AffineParams,
})

export type VariationCategory =
  | 'blur'
  | 'post'
  | 'pre'
  | 'crop'
  | 'symmetry'
  | 'dc'
  | 'glsl'
  | 'cut'
  | '3d'
  | 'general'

export type SimpleVariation<K extends string> = {
  category: VariationCategory
  DescriptorSchema: v.ObjectSchema<
    {
      readonly type: v.LiteralSchema<K, undefined>
      readonly weight: v.NumberSchema<undefined>
      readonly visible: OptionalSchema<BooleanSchema<undefined>, true>
    },
    undefined
  >
  fn: TgpuFn<(pos: Vec2f, info: typeof VariationInfo) => Vec2f>
}

export function simpleVariation<K extends string>(
  variationKey: K,
  impl: (pos: v2f, varInfo: VariationInfo) => v2f,
  category: VariationCategory = 'general',
): SimpleVariation<K> {
  return {
    category,
    DescriptorSchema: v.object({
      type: v.literal(variationKey),
      weight: v.number(),
      visible: v.optional(v.boolean(), true),
    }),
    fn: tgpu.fn([vec2f, VariationInfo], vec2f)(impl).$name(variationKey),
  }
}
