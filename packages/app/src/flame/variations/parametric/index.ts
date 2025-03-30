import { transformVariations } from '..'
import type { ParametricVariationDescriptor } from '..'
import type { EditorFor } from '@/components/variationParamEditors/types'

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
