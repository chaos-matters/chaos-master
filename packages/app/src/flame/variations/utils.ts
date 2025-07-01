import { isParametricVariationType, transformVariations } from '.'
import type {
  ParametricVariationDescriptor,
  TransformVariationDescriptor,
  TransformVariationType,
} from '.'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

export function getVariationDefault(
  type: TransformVariationType,
  weight: number,
): TransformVariationDescriptor {
  if (!isParametricVariationType(type)) {
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
