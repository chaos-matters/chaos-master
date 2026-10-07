import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addCustomPalette, paletteEntry } from '@/flame/colorMap'
import { defaultPalettes } from '@/flame/palettes'
import { DEFAULT_PALETTE_ID, paletteLut, resolvePalette, } from './explorerPalette'
import type { Palette } from '@/flame/colorMap'

// The test runner's own localStorage is not a working Storage.
const stored = new Map<string, string>()
const memoryStorage: Storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => {
    stored.set(key, value)
  },
  removeItem: (key) => {
    stored.delete(key)
  },
  clear: () => {
    stored.clear()
  },
  key: (index) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size
  },
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
})

afterEach(() => {
  stored.clear()
  vi.unstubAllGlobals()
})

describe('paletteLut', () => {
  it('runs the ramp out and back, so the cycle closes without a seam', () => {
    const palette = defaultPalettes.find((p) => p.entries.length > 2)!
    const lut = paletteLut(palette, 16)
    expect(lut).toHaveLength(32)
    for (let i = 1; i < 8; i += 1) {
      expect(lut[2 * i]).toBeCloseTo(lut[2 * (16 - i)]!, 6)
      expect(lut[2 * i + 1]).toBeCloseTo(lut[2 * (16 - i) + 1]!, 6)
    }
    expect(lut.every(Number.isFinite)).toBe(true)
  })
})

describe('resolvePalette', () => {
  const flam3: Palette = {
    id: 'official-abc12-3de45',
    name: 'south-sea-bather',
    entries: [paletteEntry(0, 0.1, 0.2), paletteEntry(1, -0.3, 0.1)],
    source: 'official',
  }

  it('applies the palette just picked, from any source', () => {
    expect(resolvePalette(flam3.id, flam3)).toBe(flam3)
  })

  it('finds a custom palette saved in this browser by its id', () => {
    const saved = addCustomPalette({
      name: 'Mine',
      entries: [paletteEntry(0, 0.2, 0.2), paletteEntry(1, -0.2, -0.2)],
      source: 'custom',
    })
    expect(resolvePalette(saved.id, undefined).name).toBe('Mine')
  })

  it('falls back to the default for an id nothing matches', () => {
    expect(resolvePalette('official-gone', undefined).id).toBe(
      DEFAULT_PALETTE_ID,
    )
    expect(resolvePalette(undefined, flam3).id).toBe(DEFAULT_PALETTE_ID)
  })
})
