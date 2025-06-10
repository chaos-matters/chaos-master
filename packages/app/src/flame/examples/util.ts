import { safeParse } from 'valibot'
import { FlameDescriptorSchema } from '../valibot/flameSchema'
import type {
  FlameDescriptor,
  TransformId,
  VariationId,
} from '../transformFunction'

export function tid(transformId: string): TransformId {
  return transformId as TransformId
}

export function vid(variationId: string): VariationId {
  return variationId as VariationId
}

export function validateExample(data: unknown): FlameDescriptor {
  const result = safeParse(FlameDescriptorSchema, data)
  if (!result.success) {
    console.warn('Validation issues: ', result.issues)
    throw new Error(
      'This flame cannot be shown, please check console for more info.',
    )
  }
  return result.output
}
