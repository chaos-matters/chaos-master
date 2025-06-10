import { transformVariationsParamsSchemas } from '@/flame/valibot/variationSchema'
import { isParametric, transformVariations } from '..'
import type { ParametricVariationDescriptor, TransformVariation } from '..'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'
import type { TransformVariationDescriptor } from '@/flame/valibot/variationSchema'

export function getVariationDefault(
  type: TransformVariation,
  weight: number,
): TransformVariationDescriptor {
  if (!isParametric(type)) {
    return { type, weight } as TransformVariationDescriptor
  }
  return {
    type,
    params: transformVariationsParamsSchemas[type].defaults,
    weight,
  } as TransformVariationDescriptor
}

export function getParamsEditor<T extends ParametricVariationDescriptor>(
  variation: T,
): { component: EditorFor<T['params']>; value: T['params'] } {
  return {
    component: transformVariations[variation.type].editor as EditorFor<
      T['params']
    >,
    get value() {
      return variation.params
    },
  }
}
