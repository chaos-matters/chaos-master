/**
 * Parser for Flam3 palette XML files.
 *
 * Supports two formats:
 * 1. Official Flam3 format: `<palette number="N" name="..." data="00RRGGBB00RRGGBB...">`
 *    - 256 RGB colors encoded as hex strings (8 chars each, prefix 00)
 *    - Loaded from /data/flam3-palettes.xml (the official scottdraves/flam3 palettes)
 * 2. Extended XML format: `<palette><color index="N" red="0-1" green="0-1" blue="0-1"/>...</palette>`
 *    - User-importedflam3 XML files may use this format
 *
 * All colors are converted to OkLab a/b coordinates for perceptual uniformity.
 * Alpha/vibrancy calculation is based on flam3_calc_alpha from flam3/palettes.c.
 */

import { paletteEntry } from './colorMap'
import type { Palette } from './colorMap'

/** PREFILTER_WHITE: normalization constant matching flam3/rect.c */
export const PREFILTER_WHITE = 255

/**
 * Calculate alpha value from density, matching flam3_calc_alpha() in flam3/palettes.c.
 * This drives the vibrancy/brightness of the palette coloring.
 *
 * @param density - iteration density (0-1 normalized)
 * @param gamma - gamma correction value
 * @param linrange - linear range threshold
 */
export function flam3CalcAlpha(
  density: number,
  gamma: number,
  linrange: number,
): number {
  if (density <= 0) return 0

  const funcval = Math.pow(linrange, gamma)

  if (density < linrange) {
    const frac = density / linrange
    return (
      (1 - frac) * density * (funcval / linrange) +
      frac * Math.pow(density, gamma)
    )
  }

  return Math.pow(density, gamma)
}

export type Flam3PaletteData = {
  number: number
  name: string
  colors: { position: number; r: number; g: number; b: number }[]
}

/**
 * Parse the official Flam3 palettes.xml format.
 * Each palette has a `data` attribute containing 256 RGB hex values (8 chars each).
 * Format: `00RRGGBB00RRGGBB...` (e.g. "00b9eaeb" = r=185, g=234, b=235)
 */
function parseOfficialFlam3Format(doc: Document): Flam3PaletteData[] {
  const palettes: Flam3PaletteData[] = []
  const paletteNodes = doc.querySelectorAll('palette')

  paletteNodes.forEach((node) => {
    const number = parseInt(node.getAttribute('number') ?? '-1', 10)
    const name = node.getAttribute('name') ?? 'Unnamed Palette'
    const dataAttr = node.getAttribute('data')

    if (dataAttr === null) {
      palettes.push({ number, name, colors: [] })
      return
    }

    // Normalize whitespace: join all text content
    const data = dataAttr.trim().replace(/\s+/g, '')
    const colors: Flam3PaletteData['colors'] = []

    // Each color is 8 chars: "00RRGGBB"
    for (let i = 0; i < 256 && i * 8 + 8 <= data.length; i++) {
      const hex = data.slice(i * 8, i * 8 + 8)
      // Skip the "00" prefix, extract RRGGBB
      const r = parseInt(hex.slice(2, 4), 16)
      const g = parseInt(hex.slice(4, 6), 16)
      const b = parseInt(hex.slice(6, 8), 16)

      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        colors.push({
          position: i / 255,
          r,
          g,
          b,
        })
      }
    }

    palettes.push({ number, name, colors })
  })

  return palettes
}

/**
 * Parse the extendedflam3 XML format with <color> child elements.
 * This format is used by some user-exportedflam3 files.
 */
function parseExtendedFormat(doc: Document): Flam3PaletteData[] {
  const palettes: Flam3PaletteData[] = []
  const paletteNodes = doc.querySelectorAll('palette')

  paletteNodes.forEach((node) => {
    // Skip if this palette has a `data` attribute (official format, already parsed)
    if (node.hasAttribute('data')) return

    const name = node.getAttribute('name') ?? 'Unnamed Palette'
    const colorNodes = node.querySelectorAll('color')

    const colors: Flam3PaletteData['colors'] = []

    colorNodes.forEach((colorNode) => {
      const index = parseInt(colorNode.getAttribute('index') ?? '0', 10)
      const r = parseFloat(colorNode.getAttribute('red') ?? '0')
      const g = parseFloat(colorNode.getAttribute('green') ?? '0')
      const b = parseFloat(colorNode.getAttribute('blue') ?? '0')

      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        // red/green/blue are 0-1 in this format
        colors.push({
          position: index / 255,
          r: Math.round(r * 255),
          g: Math.round(g * 255),
          b: Math.round(b * 255),
        })
      }
    })

    // Sort by position
    colors.sort((a, b) => a.position - b.position)

    palettes.push({ number: -1, name, colors })
  })

  return palettes
}

/**
 * Parse a flam3 palette XML string and return palette data.
 * Automatically detects the format (official vs extended).
 */
export function parseFlam3Palettes(xmlContent: string): Flam3PaletteData[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlContent, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Invalid XML format in palette file')
  }

  // Official format takes precedence (has `data` attribute)
  const official = parseOfficialFlam3Format(doc)
  const extended = parseExtendedFormat(doc)

  return [...official, ...extended]
}

/**
 * RGB to OkLab conversion (D65 illuminant).
 * L is discarded since we use fixed L=0.7 for rendering.
 * Returns normalized a/b in range roughly -1 to 1.
 */
function rgbToOklab(r: number, g: number, b: number): { a: number; b: number } {
  const toLinear = (c: number) =>
    c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92

  const rLin = toLinear(r / 255)
  const gLin = toLinear(g / 255)
  const bLin = toLinear(b / 255)

  // Linear RGB to XYZ (D65)
  const x = 0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin
  const y = 0.2126729 * rLin + 0.7151522 * gLin + 0.072175 * bLin
  const z = 0.0193339 * rLin + 0.119192 * gLin + 0.9503041 * bLin

  // XYZ to Lab (D65)
  const xn = 0.95047,
    yn = 1.0,
    zn = 1.08883

  const f = (t: number) =>
    t > 0.008856 ? Math.pow(t, 1 / 3) : (903.3 * t + 16) / 116

  const fx = f(x / xn)
  const fy = f(y / yn)
  const fz = f(z / zn)

  const a = 500 * (fx - fy)
  const bLab = 200 * (fy - fz)

  // Normalize to roughly -1 to 1
  return { a: a / 100, b: bLab / 100 }
}

/**
 * Convert Flam3PaletteData to our internal Palette format.
 * Samples 256 colors and interpolates to gradient stops.
 */
export function flam3PaletteToPalette(flam3Palette: Flam3PaletteData): Palette {
  const colors = flam3Palette.colors

  if (colors.length === 0) {
    return {
      id: `official-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: flam3Palette.name,
      entries: [paletteEntry(0, 0, 0), paletteEntry(1, 0, 0)],
      source: 'official',
      createdAt: Date.now(),
    }
  }

  // Sample colors at regular intervals to build gradient stops
  const numStops = 8
  const entries = []

  for (let i = 0; i < numStops; i++) {
    const position = i / (numStops - 1)

    // Get interpolated color for smoother gradients
    const exactIndex = position * (colors.length - 1)
    const lowIdx = Math.floor(exactIndex)
    const highIdx = Math.min(lowIdx + 1, colors.length - 1)
    const t = exactIndex - lowIdx

    const low = colors[lowIdx]!
    const high = colors[highIdx]!

    const r = low.r + (high.r - low.r) * t
    const g = low.g + (high.g - low.g) * t
    const b = low.b + (high.b - low.b) * t

    const { a, b: bOklab } = rgbToOklab(r, g, b)
    entries.push(paletteEntry(position, a, bOklab))
  }

  return {
    id: `official-${flam3Palette.number}`,
    name: flam3Palette.name,
    entries,
    source: 'official',
    createdAt: Date.now(),
  }
}

/**
 * Import palettes from a flam3 XML file (user-imported).
 */
export async function importFlam3Palettes(file: File): Promise<Palette[]> {
  const content = await file.text()
  const palettes = parseFlam3Palettes(content)
  // Only use extended format palettes for imports (official already has the data)
  const extended = palettes.filter((p) => p.number < 0)
  return extended.map(flam3PaletteToPalette)
}

/**
 * Load and parse the official Flam3 palettes from /data/flam3-palettes.xml.
 */
export async function loadOfficialPalettes(): Promise<Palette[]> {
  try {
    const res = await fetch('/data/flam3-palettes.xml')
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
    const text = await res.text()
    const palettes = parseFlam3Palettes(text)
    return palettes.map(flam3PaletteToPalette)
  } catch (err) {
    console.error('Failed to load official Flam3 palettes:', err)
    return []
  }
}
