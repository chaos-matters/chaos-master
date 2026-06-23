import { describe, expect, it } from 'vitest'
import { allTransformVariations, isVariationType } from '@/flame/variations'
import { variationDocs } from './index'

// Index by plain string to avoid the ~300-member keyof union (TS2590).
const VARIATIONS = allTransformVariations as unknown as Record<
  string,
  { paramDefaults?: Record<string, number> }
>

describe('variation docs coverage', () => {
  it('only documents variation types that exist', () => {
    for (const type of Object.keys(variationDocs)) {
      expect(isVariationType(type), `"${type}" is not a real variation`).toBe(
        true,
      )
    }
  })

  it('only documents parameters that exist on the variation', () => {
    for (const [type, doc] of Object.entries(variationDocs)) {
      if (!doc?.params) continue
      const variation = VARIATIONS[type]
      const fields = new Set(Object.keys(variation?.paramDefaults ?? {}))
      for (const param of Object.keys(doc.params)) {
        expect(
          fields.has(param),
          `"${type}.params.${param}" is not a real parameter`,
        ).toBe(true)
      }
    }
  })
})
