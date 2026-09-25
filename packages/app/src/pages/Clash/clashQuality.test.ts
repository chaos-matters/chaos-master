/**
 * The clash preview's GPU budget by hardware tier.
 */
import { describe, expect, it } from 'vitest'
import { clashQuality } from './clashQuality'

describe('clashQuality', () => {
  it('shrinks the canvas on weaker tiers', () => {
    const scales = (['ultra', 'high', 'mid', 'low'] as const).map(
      (tier) => clashQuality(tier, false).renderScale,
    )
    expect(scales).toEqual([1, 1, 0.75, 0.5])
  })

  it('takes a touch screen with no stored tier for a phone', () => {
    expect(clashQuality(null, true)).toEqual(clashQuality('mid', false))
    expect(clashQuality(undefined, false)).toEqual(clashQuality('high', true))
  })

  it('ignores a stored tier it does not know', () => {
    expect(clashQuality('huge' as never, false)).toEqual(
      clashQuality('high', false),
    )
  })
})
