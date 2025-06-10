import { flatten, safeParse } from 'valibot'
import { FlameDescriptorSchema } from '../schema/flameSchema'
import type { FlatErrors } from 'valibot'
import type { FlameDescriptorDraft } from '../schema/flameSchema'
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

function prettyPrintValibotErrors(
  flatErrors: FlatErrors<typeof FlameDescriptorSchema>,
) {
  const { root, nested, other } = flatErrors

  if (root !== undefined) {
    console.warn('Root issues: ')
    console.table(root)
  }
  if (nested !== undefined) {
    const nestedIssues = Object.fromEntries(
      Object.entries(nested).map(([key, value]) => [
        key,
        value ? value.join(' & ') : 'Unknown Issue',
      ]),
    )
    console.warn('Schema issues: ')
    console.table(nestedIssues)
  }
  if (other !== undefined) {
    console.warn('Other issues: ')
    console.table(other)
  }
}

export function validateFlame(data: unknown): FlameDescriptor {
  const result = safeParse(FlameDescriptorSchema, data)
  if (!result.success) {
    const flatErrors = flatten<typeof FlameDescriptorSchema>(result.issues)
    prettyPrintValibotErrors(flatErrors)
    throw new Error(
      'This flame cannot be shown, please check console for more info.',
    )
  }
  return result.output
}

export function defineExample(example: FlameDescriptorDraft) {
  return validateFlame(example)
}
