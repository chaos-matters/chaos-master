import { validateFlame, validateFlame3D } from '../schema/flameSchema'
import type { FlameDescriptor, FlameDescriptor3D, TransformId, VariationId, } from '../schema/flameSchema'
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

export function defineExample3D(example: InferInput<typeof FlameDescriptor3D>) {
  return validateFlame3D(example)
}
