import { tgpu } from 'typegpu'
import { vec2f } from 'typegpu/data'
import { structToSchema } from '@/utils/schemaUtil'
import * as v from '@/valibot'
import { VariationInfo } from '../simple/types'
import type { TgpuFn } from 'typegpu'
import type { BaseData, Infer, Vec2f, WgslStruct } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type ParametricVariationDescriptor<
  K extends string,
  T extends Record<string, BaseData>,
> = v.ObjectSchema<
  {
    readonly type: v.LiteralSchema<K, undefined>
    readonly weight: v.NumberSchema<undefined>
    readonly params: v.ObjectSchema<
      Record<keyof T, v.NumberSchema<undefined>>,
      undefined
    >
  },
  undefined
>

type ParametricVariation<
  K extends string,
  T extends Record<string, BaseData>,
> = {
  DescriptorSchema: ParametricVariationDescriptor<K, T>
  paramStruct: WgslStruct<T>
  paramDefaults: Infer<WgslStruct<T>>
  editor: EditorFor<Infer<WgslStruct<T>>>
  fn: TgpuFn<
    (
      pos: Vec2f,
      variationInfo: typeof VariationInfo,
      params: WgslStruct<T>,
    ) => Vec2f
  >
}

export function parametricVariationDescriptor<
  K extends string,
  T extends Record<string, BaseData>,
>(
  variationType: K,
  paramStruct: WgslStruct<T>,
): ParametricVariationDescriptor<K, T> {
  const ParamSchema = structToSchema(paramStruct)
  return v.object({
    type: v.literal(variationType),
    weight: v.number(),
    params: ParamSchema,
  })
}

export function parametricVariation<
  K extends string,
  T extends Record<string, BaseData>,
>(
  variationKey: K,
  paramStruct: WgslStruct<T>,
  paramDefaults: Infer<WgslStruct<T>>,
  editor: EditorFor<Infer<WgslStruct<T>>>,
  wgsl: string,
  dependencyMap: Record<string, unknown> = {},
): ParametricVariation<K, T> {
  return {
    DescriptorSchema: parametricVariationDescriptor(variationKey, paramStruct),
    paramStruct,
    paramDefaults,
    editor,
    fn: tgpu
      .fn([vec2f, VariationInfo, paramStruct], vec2f)(wgsl)
      .$uses(dependencyMap),
  }
}
