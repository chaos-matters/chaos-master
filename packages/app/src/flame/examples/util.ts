import { validateFlame } from '../schema/flameSchema'
import type {
  FlameDescriptor,
  TransformId,
  VariationId,
} from '../schema/flameSchema'
import type { InferInput } from '@/valibot'

export function tid(transformId: string): TransformId {
  return transformId as TransformId
}

export function vid(variationId: string): VariationId {
  return variationId as VariationId
}

export function defineExample(example: InferInput<typeof FlameDescriptor>) {
  return validateFlame(example)
}
