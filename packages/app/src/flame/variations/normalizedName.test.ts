import { describe, expect, it } from 'vitest'
import { createCustomVariation } from './custom/CustomVariationRegistry'
import { getNormalizedVariationName } from './utils'

describe('getNormalizedVariationName', () => {
  it('strips Var/3D suffixes for built-in variations', () => {
    expect(getNormalizedVariationName('swirlVar')).toBe('swirl')
  })

  it('shows the human name for a registered custom variation', () => {
    const created = createCustomVariation('My Cool Variation', 'return pos;')
    expect(created.success).toBe(true)
    if (!created.success) throw new Error('setup failed')
    expect(getNormalizedVariationName(created.def.id)).toBe('My Cool Variation')
  })

  it('falls back to the normalized id for an unknown custom id', () => {
    expect(getNormalizedVariationName('custom_unknown_id')).toBe(
      'custom_unknown_id',
    )
  })
})
