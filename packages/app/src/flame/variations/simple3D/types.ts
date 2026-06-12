import { tgpu } from 'typegpu'
import { f32, struct, vec3f } from 'typegpu/data'
import * as v from '@/valibot'
import { AffineParams3D } from '../../affineTransform3D'
import type { TgpuFn } from 'typegpu'
import type { Infer, v3f, Vec3f } from 'typegpu/data'
import type { BooleanSchema, OptionalSchema } from 'valibot'
import type { VariationCategory } from '../categories'

export type VariationInfo3D = Infer<typeof VariationInfo3D>
export const VariationInfo3D = struct({
  weight: f32,
  affineCoefs: AffineParams3D,
})

export type SimpleVariation3D<K extends string> = {
  category: VariationCategory
  DescriptorSchema: v.ObjectSchema<
    {
      readonly type: v.LiteralSchema<K, undefined>
      readonly weight: v.NumberSchema<undefined>
      readonly visible: OptionalSchema<BooleanSchema<undefined>, true>
    },
    undefined
  >
  fn: TgpuFn<(pos: Vec3f, info: typeof VariationInfo3D) => Vec3f>
}

export function simpleVariation3D<K extends string>(
  variationKey: K,
  impl: (pos: v3f, varInfo: VariationInfo3D) => v3f,
  category: VariationCategory = 'general',
): SimpleVariation3D<K> {
  return {
    category,
    DescriptorSchema: v.object({
      type: v.literal(variationKey),
      weight: v.number(),
      visible: v.optional(v.boolean(), true),
    }),
    fn: tgpu.fn([vec3f, VariationInfo3D], vec3f)(impl),
  }
}
