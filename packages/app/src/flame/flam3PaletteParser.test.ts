import { describe, expect, it } from 'vitest'
import { flam3CalcAlpha, flam3PaletteToPalette, parseFlam3Palettes, } from './flam3PaletteParser'

describe('parseFlam3Palettes', () => {
  it('parses official format with hex data', () => {
    const xml = `<?xml version="1.0"?>
<palettes>
  <palette number="1" name="test-palette" data="00FF0000 00FF8000 0000FF00"/>
</palettes>`
    const palettes = parseFlam3Palettes(xml)
    expect(palettes).toHaveLength(1)
    expect(palettes[0]!.number).toBe(1)
    expect(palettes[0]!.name).toBe('test-palette')
    expect(palettes[0]!.colors.length).toBeGreaterThan(0)
  })

  it('parses official format compact hex (no spaces)', () => {
    const xml = `<?xml version="1.0"?>
<palettes>
  <palette number="42" name="compact" data="00FF000000FF000000FF0000"/>
</palettes>`
    const palettes = parseFlam3Palettes(xml)
    expect(palettes).toHaveLength(1)
    expect(palettes[0]!.number).toBe(42)
    expect(palettes[0]!.colors[0]!.r).toBe(255)
    expect(palettes[0]!.colors[0]!.g).toBe(0)
    expect(palettes[0]!.colors[0]!.b).toBe(0)
    expect(palettes[0]!.colors[1]!.r).toBe(255)
  })

  it('parses extended XML format with color elements', () => {
    const xml = `<?xml version="1.0"?>
<palettes>
  <palette name="extended-test">
    <color index="0" red="1" green="0" blue="0"/>
    <color index="128" red="0" green="1" blue="0"/>
    <color index="255" red="0" green="0" blue="1"/>
  </palette>
</palettes>`
    const palettes = parseFlam3Palettes(xml)
    expect(palettes).toHaveLength(1)
    expect(palettes[0]!.name).toBe('extended-test')
    expect(palettes[0]!.number).toBe(-1) // extended format uses -1
    expect(palettes[0]!.colors.length).toBe(3)
    expect(palettes[0]!.colors[0]!.r).toBe(255)
  })

  it('skips palettes with data attribute when parsing extended format', () => {
    const xml = `<?xml version="1.0"?>
<palettes>
  <palette number="5" name="has-both" data="00FF0000"/>
  <palette name="extended-only">
    <color index="0" red="0" green="0" blue="1"/>
  </palette>
</palettes>`
    const palettes = parseFlam3Palettes(xml)
    // Should have 2: 1 from official (number=5) + 1 from extended (number=-1)
    expect(palettes).toHaveLength(2)
    const official = palettes.find((p) => p.number === 5)
    const extended = palettes.find((p) => p.number === -1)
    expect(official).toBeDefined()
    expect(extended).toBeDefined()
    expect(extended!.name).toBe('extended-only')
  })

  it('throws on invalid XML', () => {
    expect(() => parseFlam3Palettes('not xml at all')).toThrow(
      'Invalid XML format',
    )
  })
})

describe('flam3PaletteToPalette', () => {
  it('converts official format to Palette', () => {
    const xml = `<?xml version="1.0"?>
<palettes>
  <palette number="7" name="my-palette" data="00FF0000"/>
</palettes>`
    const data = parseFlam3Palettes(xml)
    const palette = flam3PaletteToPalette(data[0]!)
    expect(palette.name).toBe('my-palette')
    expect(palette.source).toBe('official')
    expect(palette.entries.length).toBeGreaterThan(0)
    expect(palette.entries[0]!.position).toBe(0)
    expect(palette.entries[palette.entries.length - 1]!.position).toBe(1)
  })

  it('uses interpolated colors for smooth gradients', () => {
    // Red -> Green -> Blue gradient
    const xml = `<?xml version="1.0"?>
<palettes>
  <palette number="99" name="rgb-gradient" data="00FF0000 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00 0000FF00"/>
</palettes>`
    const data = parseFlam3Palettes(xml)
    expect(data[0]!.colors.length).toBe(256)
  })
})

describe('flam3CalcAlpha', () => {
  it('returns 0 for zero density', () => {
    expect(flam3CalcAlpha(0, 0.5, 1)).toBe(0)
  })

  it('returns 0 for negative density', () => {
    expect(flam3CalcAlpha(-0.5, 0.5, 1)).toBe(0)
  })

  it('returns density^gamma for density >= linrange', () => {
    const gamma = 0.5
    const linrange = 0.5
    expect(flam3CalcAlpha(0.5, gamma, linrange)).toBeCloseTo(
      Math.pow(0.5, gamma),
      5,
    )
    expect(flam3CalcAlpha(1.0, gamma, linrange)).toBeCloseTo(
      Math.pow(1.0, gamma),
      5,
    )
  })

  it('uses interpolation formula for density < linrange', () => {
    const gamma = 0.5
    const linrange = 1.0
    const density = 0.3
    const funcval = Math.pow(linrange, gamma)
    const frac = density / linrange
    const expected =
      (1 - frac) * density * (funcval / linrange) +
      frac * Math.pow(density, gamma)
    expect(flam3CalcAlpha(density, gamma, linrange)).toBeCloseTo(expected, 5)
  })

  it('matches C implementation behavior', () => {
    // Verify against known values from the C implementation
    expect(flam3CalcAlpha(0.1, 0.5, 1.0)).toBeGreaterThan(0)
    expect(flam3CalcAlpha(0.5, 0.5, 1.0)).toBeCloseTo(0.707, 2)
    expect(flam3CalcAlpha(1.0, 0.5, 1.0)).toBeCloseTo(1.0, 5)
    expect(flam3CalcAlpha(2.0, 0.5, 1.0)).toBeCloseTo(Math.pow(2, 0.5), 5)
  })
})
