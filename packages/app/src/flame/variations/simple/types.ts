import { tgpu } from 'typegpu'
import { f32, struct, vec2f } from 'typegpu/data'
import * as v from '@/valibot'
import { AffineParams } from '../../affineTranform'
import type { TgpuFn } from 'typegpu'
import type { Infer, Vec2f } from 'typegpu/data'

export type VariationInfoType = Infer<typeof VariationInfo>
export const VariationInfo = struct({
  weight: f32,
  affineCoefs: AffineParams,
})

export type SimpleVariation<K extends string> = {
  DescriptorSchema: v.ObjectSchema<
    {
      readonly type: v.LiteralSchema<K, undefined>
      readonly weight: v.NumberSchema<undefined>
    },
    undefined
  >
  fn: TgpuFn<[Vec2f, typeof VariationInfo], Vec2f>
}

export function simpleVariation<K extends string>(
  variationKey: K,
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): SimpleVariation<K> {
  return {
    DescriptorSchema: v.object({
      type: v.literal(variationKey),
      weight: v.number(),
    }),
    fn: tgpu['~unstable']
      .fn([vec2f, VariationInfo], vec2f)(wgsl)
      .$uses(dependencyMap),
  }
}
