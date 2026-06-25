import { variationDocsContent } from './content'
import { variationDocsGeneral } from './content.general'
import { variationDocsSimple } from './content.simple'
import type { VariationDoc, VariationDocMap } from './types'
import type { AnyVariationType } from '@/flame/variationRegistry'

export type {
  ParamDoc,
  ParamValueType,
  VariationDoc,
  VariationDocMap,
} from './types'

export const variationDocs: VariationDocMap = {
  ...variationDocsContent,
  ...variationDocsSimple,
  ...variationDocsGeneral,
}

export function getVariationDoc(
  type: AnyVariationType,
): VariationDoc | undefined {
  return variationDocs[type]
}

export function hasDoc(type: AnyVariationType): boolean {
  return type in variationDocs
}
