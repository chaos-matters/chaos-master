import { tgpu } from 'typegpu'
import { vec3f } from 'typegpu/data'
import { structToSchema } from '@/utils/schemaUtil'
import * as v from '@/valibot'
import { VariationInfo3D } from '../simple3D/types'
import type { TgpuFn } from 'typegpu'
import type { BaseData, Infer, v3f, Vec3f, WgslStruct } from 'typegpu/data'
import type { BooleanSchema, OptionalSchema } from 'valibot'
import type { VariationCategory } from '../categories'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type ParametricVariation3DDescriptor<
  K extends string,
  T extends Record<string, BaseData>,
> = v.ObjectSchema<
  {
    readonly type: v.LiteralSchema<K, undefined>
    readonly weight: v.NumberSchema<undefined>
    readonly visible: OptionalSchema<BooleanSchema<undefined>, true>
    readonly params: v.ObjectSchema<
      Record<keyof T, v.NumberSchema<undefined>>,
      undefined
    >
  },
  undefined
>

export type ParametricVariation3D<
  K extends string,
  T extends Record<string, BaseData>,
> = {
  category: VariationCategory
  DescriptorSchema: ParametricVariation3DDescriptor<K, T>
  paramStruct: WgslStruct<T>
  paramDefaults: Infer<WgslStruct<T>>
  editor: EditorFor<Infer<WgslStruct<T>>>
  fn: TgpuFn<
    (
      pos: Vec3f,
      variationInfo: typeof VariationInfo3D,
      params: WgslStruct<T>,
    ) => Vec3f
  >
}

export function parametricVariation3DDescriptor<
  K extends string,
  T extends Record<string, BaseData>,
>(
  variationType: K,
  paramStruct: WgslStruct<T>,
  paramDefaults?: Infer<WgslStruct<T>>,
): ParametricVariation3DDescriptor<K, T> {
  const ParamSchema = structToSchema(paramStruct)
  // We use type assertion here to bypass strict return type while still emitting the correct type signature
  return v.object({
    type: v.literal(variationType),
    weight: v.number(),
    visible: v.optional(v.boolean(), true),
    params: (paramDefaults
      ? v.optional(
          ParamSchema,
          () =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            paramDefaults as any,
        )
      : ParamSchema) as unknown as v.ObjectSchema<
      Record<keyof T, v.NumberSchema<undefined>>,
      undefined
    >,
  })
}

export function parametricVariation3D<
  K extends string,
  T extends Record<string, BaseData>,
>(
  variationKey: K,
  paramStruct: WgslStruct<T>,
  paramDefaults: Infer<WgslStruct<T>>,
  editor: EditorFor<Infer<WgslStruct<T>>>,
  impl: (
    pos: v3f,
    varInfo: Infer<typeof VariationInfo3D>,
    params: Infer<WgslStruct<T>>,
  ) => v3f,
  category: VariationCategory = 'general',
): ParametricVariation3D<K, T> {
  return {
    category,
    DescriptorSchema: parametricVariation3DDescriptor(
      variationKey,
      paramStruct,
      paramDefaults,
    ),
    paramStruct,
    paramDefaults,
    editor,
    fn: tgpu
      .fn([vec3f, VariationInfo3D, paramStruct], vec3f)(impl)
      .$name(variationKey),
  }
}
