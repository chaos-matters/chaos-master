import {
  isParametric,
  transformVariations,
} from '..'
import type { Infer } from 'typegpu/data'
import type {
  ParametricVariationDescriptor,
  TransformVariation} from '..';
import type { EditorFor } from '@/components/variationParamEditors/types'

export function getParamsDefaults<T extends ParametricVariationDescriptor>(
  varName: TransformVariation,
): Infer<T['params']> {
  if (isParametric(varName)) {
    return transformVariations[varName as T['type']].paramDefaults as Infer<
      T['params']
    >
  }
  throw new Error('No such variation')
}
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
