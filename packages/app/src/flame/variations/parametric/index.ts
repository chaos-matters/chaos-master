import { isParametric, transformVariations } from '..'
import type {
  ParametricVariationDescriptor,
  TransformVariation,
  TransformVariationDescriptor,
} from '..'
import type { EditorFor } from '@/components/variationParamEditors/types'

export function getVariationDefault(
  type: TransformVariation,
  weight: number,
): TransformVariationDescriptor {
  if (!isParametric(type)) {
    return { type, weight } as TransformVariationDescriptor
  }
  return {
    type,
    params: transformVariations[type].paramDefaults,
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
