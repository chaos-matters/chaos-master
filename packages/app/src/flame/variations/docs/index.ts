import { variationDocsContent } from './content'
import { variationDocs3D } from './content.3d'
import { variationDocsGeneral } from './content.general'
import { variationDocsGeneral2 } from './content.general2'
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
  ...variationDocsGeneral2,
  ...variationDocs3D,
}

export function getVariationDoc(
  type: AnyVariationType,
): VariationDoc | undefined {
  return variationDocs[type]
}

export function hasDoc(type: AnyVariationType): boolean {
  return type in variationDocs
}
