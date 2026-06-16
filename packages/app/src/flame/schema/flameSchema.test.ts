import { describe, expect, it } from 'vitest'
import { recordEntries } from '@/utils/record'
import { initExample3D } from '../examples/initExample3D'
import { tryValidateFlame } from './flameSchema'

describe('tryValidateFlame — recent/stored flame loading soundness', () => {
  it('preserves a 3D flame rather than dropping it or stripping it to 2D', () => {
    // Mimic a flame restored from storage (plain JSON, no live store proxies).
    const stored: unknown = JSON.parse(JSON.stringify(initExample3D))
    const result = tryValidateFlame(stored)
    expect(result).toBeDefined()
    expect(result?.renderSettings.dimensions).toBe(3)
    // A 3D affine carries g–l components that a 2D-only parse would strip.
    const transform = recordEntries(result!.transforms)[0]?.[1]
    expect(transform?.preAffine).toHaveProperty('l')
  })

  it('returns undefined for invalid data instead of throwing', () => {
    expect(tryValidateFlame(null)).toBeUndefined()
    expect(tryValidateFlame({ nonsense: true })).toBeUndefined()
  })
})
