import { describe, expect, it } from 'vitest'
import { decodeVariationShare, encodeJsonQueryParam } from './jsonQueryParam'
import type { CustomVariationDef } from '@/flame/variations/custom'

const def: CustomVariationDef = {
  id: 'custom_abc123',
  name: 'Swirl <test>',
  wgsl: 'let r = length(pos);\nreturn pos;',
  createdAt: 1,
  updatedAt: 2,
}

describe('variation share encode/decode', () => {
  it('round-trips a single custom variation', async () => {
    const encoded = await encodeJsonQueryParam({ variation: def })
    const decoded = await decodeVariationShare(encoded)
    expect(decoded).toEqual(def)
  })

  it('rejects a payload without a variation', async () => {
    const encoded = await encodeJsonQueryParam({ flame: {} })
    await expect(decodeVariationShare(encoded)).rejects.toThrow()
  })
})
