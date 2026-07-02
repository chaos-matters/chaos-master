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

  it('preserves an embedded palette through validation (save/share/undo)', () => {
    const stored: unknown = JSON.parse(JSON.stringify(initExample3D))
    ;(
      stored as { renderSettings: Record<string, unknown> }
    ).renderSettings.palette = {
      id: 'p1',
      name: 'Sunset',
      entries: [
        { id: 'e1', position: 0, a: 0.1, b: -0.2 },
        { id: 'e2', position: 1, a: -0.05, b: 0.15 },
      ],
    }
    const result = tryValidateFlame(stored)
    expect(result?.renderSettings.palette?.id).toBe('p1')
    expect(result?.renderSettings.palette?.entries).toHaveLength(2)
    // And absent palettes stay absent (older flames parse unchanged).
    const plain = tryValidateFlame(JSON.parse(JSON.stringify(initExample3D)))
    expect(plain?.renderSettings.palette).toBeUndefined()
  })

  it('preserves an embedded blend composition through validation', () => {
    const stored = JSON.parse(JSON.stringify(initExample3D)) as {
      renderSettings: Record<string, unknown>
    }
    stored.renderSettings.blendWeight = 0.4
    stored.renderSettings.blendFlame = JSON.parse(JSON.stringify(initExample3D))
    const result = tryValidateFlame(stored)
    expect(result?.renderSettings.blendWeight).toBe(0.4)
    // Stored as plain data; consumers re-validate on read.
    expect(tryValidateFlame(result?.renderSettings.blendFlame)).toBeDefined()
    // Absent blend stays absent for older flames.
    const plain = tryValidateFlame(JSON.parse(JSON.stringify(initExample3D)))
    expect(plain?.renderSettings.blendFlame).toBeUndefined()
    expect(plain?.renderSettings.blendWeight).toBeUndefined()
  })
})
