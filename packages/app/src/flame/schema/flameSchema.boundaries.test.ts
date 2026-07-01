import { describe, expect, it } from 'vitest'
import { renderSettingsDefault, tryValidateFlame, validateFlame, } from './flameSchema'

// Build a minimal valid 2D flame with render-settings overrides layered on the
// known-good defaults, so each test isolates a single field.
function flameWith(overrides: Record<string, unknown>): unknown {
  return {
    transforms: {},
    renderSettings: { ...renderSettingsDefault, ...overrides },
  }
}

describe('flame schema — render-settings boundaries', () => {
  it('accepts in-range render settings', () => {
    expect(() =>
      validateFlame(
        flameWith({ exposure: 8, vibrancy: 3, contrast: 20, gamma: 8 }),
      ),
    ).not.toThrow()
  })

  // Each entry pushes exactly one field outside its documented range.
  const outOfRange: [string, Record<string, unknown>][] = [
    ['exposure above max (8)', { exposure: 9 }],
    ['exposure below min (-8)', { exposure: -9 }],
    ['vibrancy above max (3)', { vibrancy: 3.1 }],
    ['vibrancy below min (0)', { vibrancy: -0.1 }],
    ['contrast above max (20)', { contrast: 21 }],
    ['contrast below min (0.01)', { contrast: 0 }],
    ['gamma above max (8)', { gamma: 8.5 }],
    ['gamma below min (0.1)', { gamma: 0.05 }],
    ['skipIters above max (30)', { skipIters: 31 }],
    ['skipIters non-integer', { skipIters: 2.5 }],
    ['paletteMode above max (1)', { paletteMode: 2 }],
    ['paletteMode non-integer', { paletteMode: 0.5 }],
  ]

  for (const [label, override] of outOfRange) {
    it(`rejects ${label}`, () => {
      expect(tryValidateFlame(flameWith(override))).toBeUndefined()
      expect(() => validateFlame(flameWith(override))).toThrow()
    })
  }
})

describe('flame schema — transform record', () => {
  it('accepts a flame with zero transforms (documents current behavior)', () => {
    // There is no minEntries on the transform record, so an empty flame
    // validates; the emptiness only surfaces later in the render pipeline.
    expect(tryValidateFlame({ transforms: {} })).toBeDefined()
  })
})
