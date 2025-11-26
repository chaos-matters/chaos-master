import { tgpu } from 'typegpu'
import { f32, i32, struct, vec2f } from 'typegpu/data'
import * as v from '@/valibot'
import { AffineParams } from '../../affineTranform'
import type { TgpuFn } from 'typegpu'
import type { Infer, v2f, Vec2f } from 'typegpu/data'

export type VariationInfo = Infer<typeof VariationInfo>
export const VariationInfo = struct({
  weight: f32,
  affineCoefs: AffineParams,
})
export type ComplexInfo = Infer<typeof ComplexInfo>
export const ComplexInfo = struct({
  restrictNext: i32,
})

export type SimpleVariation<K extends string> = {
  DescriptorSchema: v.ObjectSchema<
    {
      readonly type: v.LiteralSchema<K, undefined>
      readonly weight: v.NumberSchema<undefined>
    },
    undefined
  >
  fn: TgpuFn<(pos: Vec2f, info: typeof VariationInfo) => Vec2f>
}

export function simpleVariation<K extends string>(
  variationKey: K,
  impl: (pos: v2f, varInfo: VariationInfo) => v2f,
): SimpleVariation<K> {
  return {
    DescriptorSchema: v.object({
      type: v.literal(variationKey),
      weight: v.number(),
    }),
    fn: tgpu.fn([vec2f, VariationInfo], vec2f)(impl),
  }
}
