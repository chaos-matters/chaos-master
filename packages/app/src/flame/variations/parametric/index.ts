import { EditorFor } from '@/components/variationParamEditors/types'
import { ParametricVariationDescriptor, transformVariations } from '..'

export function getParamsEditor<T extends ParametricVariationDescriptor>(
  variation: T,
): { component: EditorFor<T['params']>; value: T['params'] } {
  return {
    component: transformVariations[variation.type as T['type']]
      .editor as EditorFor<T['params']>,
    get value() {
      return variation.params
    },
  }
}
