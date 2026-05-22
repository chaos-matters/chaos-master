/**
 * Default palettes for Chaos Master.
 *
 * These palettes are inspired by flam3 and other fractal flame editors.
 * Each palette defines color stops along a gradient, stored as OkLab a/b coordinates.
 */

import { palette, paletteEntry } from './colorMap'
import { oklabToRgbForCss } from './colors'
import type { Palette } from './colorMap'

/** Create a gradient palette from RGB stops */
function createGradientPalette(
  id: string,
  name: string,
  stops: { position: number; r: number; g: number; b: number }[],
  source: Palette['source'] = 'builtin',
): Palette {
  return palette(
    id,
    name,
    stops.map((stop) => {
      const { a, b } = rgbToOklab(stop.r, stop.g, stop.b)
      return paletteEntry(stop.position, a, b)
    }),
    source,
  )
}

/** Convert RGB (0-255) to OkLab a/b coordinates (L fixed at 0.6) */
function rgbToOklab(r: number, g: number, b: number): { a: number; b: number } {
  // Normalize to 0-1
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255

  // RGB to linear RGB
  const rLin =
    rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92
  const gLin =
    gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92
  const bLin =
    bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92

  // Linear RGB to XYZ
  const x = 0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin
  const y = 0.2126729 * rLin + 0.7151522 * gLin + 0.072175 * bLin
  const z = 0.0193339 * rLin + 0.119192 * gLin + 0.9503041 * bLin

  // XYZ to Lab (with D65 illuminant)
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

  // Normalize to -1 to 1 range for storage (L is handled separately)
  return { a: a / 100, b: bLab / 100 }
}

/** Default palettes inspired by flam3 */
export const defaultPalettes: Palette[] = [
  // === Classic/Foundational ===
  createGradientPalette('default', 'Default', [
    { position: 0.0, r: 0, g: 0, b: 0 },
    { position: 0.25, r: 128, g: 128, b: 128 },
    { position: 0.5, r: 255, g: 255, b: 255 },
    { position: 0.75, r: 128, g: 128, b: 128 },
    { position: 1.0, r: 0, g: 0, b: 0 },
  ]),
  createGradientPalette('grayscale', 'Grayscale', [
    { position: 0.0, r: 20, g: 20, b: 20 },
    { position: 0.5, r: 128, g: 128, b: 128 },
    { position: 1.0, r: 230, g: 230, b: 230 },
  ]),
  createGradientPalette('black-white', 'Black White', [
    { position: 0.0, r: 0, g: 0, b: 0 },
    { position: 1.0, r: 255, g: 255, b: 255 },
  ]),

  // === Warm Palettes ===
  createGradientPalette('fire', 'Fire', [
    { position: 0.0, r: 20, g: 0, b: 0 },
    { position: 0.2, r: 180, g: 20, b: 0 },
    { position: 0.4, r: 255, g: 80, b: 0 },
    { position: 0.6, r: 255, g: 160, b: 0 },
    { position: 0.8, r: 255, g: 240, b: 100 },
    { position: 1.0, r: 255, g: 255, b: 200 },
  ]),
  createGradientPalette('sunset', 'Sunset', [
    { position: 0.0, r: 100, g: 20, b: 80 },
    { position: 0.2, r: 180, g: 50, b: 100 },
    { position: 0.4, r: 255, g: 100, b: 50 },
    { position: 0.6, r: 255, g: 150, b: 50 },
    { position: 0.8, r: 255, g: 200, b: 100 },
    { position: 1.0, r: 255, g: 250, b: 200 },
  ]),
  createGradientPalette('sunrise', 'Sunrise', [
    { position: 0.0, r: 20, g: 20, b: 60 },
    { position: 0.2, r: 100, g: 50, b: 100 },
    { position: 0.4, r: 255, g: 100, b: 100 },
    { position: 0.6, r: 255, g: 180, b: 100 },
    { position: 0.8, r: 255, g: 230, b: 150 },
    { position: 1.0, r: 255, g: 255, b: 220 },
  ]),
  createGradientPalette('autumn', 'Autumn', [
    { position: 0.0, r: 80, g: 30, b: 20 },
    { position: 0.2, r: 160, g: 60, b: 30 },
    { position: 0.4, r: 200, g: 100, b: 40 },
    { position: 0.6, r: 230, g: 150, b: 50 },
    { position: 0.8, r: 255, g: 200, b: 100 },
    { position: 1.0, r: 255, g: 230, b: 180 },
  ]),
  createGradientPalette('ember', 'Ember', [
    { position: 0.0, r: 10, g: 0, b: 0 },
    { position: 0.15, r: 60, g: 0, b: 0 },
    { position: 0.3, r: 140, g: 20, b: 0 },
    { position: 0.5, r: 200, g: 60, b: 0 },
    { position: 0.7, r: 240, g: 120, b: 20 },
    { position: 0.85, r: 255, g: 180, b: 40 },
    { position: 1.0, r: 255, g: 230, b: 150 },
  ]),

  // === Cool Palettes ===
  createGradientPalette('ocean', 'Ocean', [
    { position: 0.0, r: 0, g: 20, b: 60 },
    { position: 0.2, r: 0, g: 60, b: 120 },
    { position: 0.4, r: 20, g: 100, b: 160 },
    { position: 0.6, r: 60, g: 150, b: 200 },
    { position: 0.8, r: 120, g: 200, b: 230 },
    { position: 1.0, r: 180, g: 230, b: 255 },
  ]),
  createGradientPalette('ice', 'Ice', [
    { position: 0.0, r: 20, g: 40, b: 80 },
    { position: 0.2, r: 60, g: 100, b: 160 },
    { position: 0.4, r: 100, g: 160, b: 220 },
    { position: 0.6, r: 160, g: 210, b: 250 },
    { position: 0.8, r: 200, g: 235, b: 255 },
    { position: 1.0, r: 240, g: 255, b: 255 },
  ]),
  createGradientPalette('arctic', 'Arctic', [
    { position: 0.0, r: 0, g: 30, b: 60 },
    { position: 0.3, r: 80, g: 130, b: 180 },
    { position: 0.5, r: 150, g: 200, b: 230 },
    { position: 0.7, r: 200, g: 230, b: 250 },
    { position: 1.0, r: 255, g: 255, b: 255 },
  ]),
  createGradientPalette('midnight', 'Midnight', [
    { position: 0.0, r: 0, g: 0, b: 20 },
    { position: 0.3, r: 0, g: 20, b: 60 },
    { position: 0.5, r: 30, g: 60, b: 120 },
    { position: 0.7, r: 60, g: 100, b: 180 },
    { position: 1.0, r: 100, g: 150, b: 220 },
  ]),
  createGradientPalette('deep-sea', 'Deep Sea', [
    { position: 0.0, r: 0, g: 20, b: 40 },
    { position: 0.25, r: 0, g: 60, b: 100 },
    { position: 0.5, r: 0, g: 120, b: 150 },
    { position: 0.75, r: 40, g: 180, b: 200 },
    { position: 1.0, r: 100, g: 220, b: 230 },
  ]),

  // === Nature Palettes ===
  createGradientPalette('forest', 'Forest', [
    { position: 0.0, r: 10, g: 20, b: 10 },
    { position: 0.25, r: 30, g: 60, b: 30 },
    { position: 0.5, r: 60, g: 100, b: 50 },
    { position: 0.75, r: 100, g: 150, b: 80 },
    { position: 1.0, r: 180, g: 220, b: 150 },
  ]),
  createGradientPalette('grass', 'Grass', [
    { position: 0.0, r: 20, g: 40, b: 20 },
    { position: 0.3, r: 60, g: 120, b: 60 },
    { position: 0.5, r: 100, g: 180, b: 100 },
    { position: 0.7, r: 150, g: 220, b: 140 },
    { position: 1.0, r: 220, g: 255, b: 200 },
  ]),
  createGradientPalette('earth', 'Earth', [
    { position: 0.0, r: 30, g: 20, b: 10 },
    { position: 0.2, r: 80, g: 50, b: 20 },
    { position: 0.4, r: 130, g: 80, b: 40 },
    { position: 0.6, r: 180, g: 120, b: 70 },
    { position: 0.8, r: 220, g: 170, b: 120 },
    { position: 1.0, r: 240, g: 210, b: 180 },
  ]),
  createGradientPalette('sand', 'Sand', [
    { position: 0.0, r: 60, g: 50, b: 30 },
    { position: 0.25, r: 120, g: 100, b: 60 },
    { position: 0.5, r: 180, g: 150, b: 100 },
    { position: 0.75, r: 220, g: 190, b: 140 },
    { position: 1.0, r: 255, g: 240, b: 200 },
  ]),
  createGradientPalette('wood', 'Wood', [
    { position: 0.0, r: 40, g: 20, b: 10 },
    { position: 0.2, r: 80, g: 40, b: 20 },
    { position: 0.4, r: 140, g: 70, b: 30 },
    { position: 0.6, r: 180, g: 100, b: 50 },
    { position: 0.8, r: 200, g: 140, b: 80 },
    { position: 1.0, r: 240, g: 190, b: 140 },
  ]),
  createGradientPalette('moss', 'Moss', [
    { position: 0.0, r: 20, g: 30, b: 10 },
    { position: 0.2, r: 50, g: 70, b: 30 },
    { position: 0.4, r: 80, g: 110, b: 50 },
    { position: 0.6, r: 110, g: 140, b: 70 },
    { position: 0.8, r: 150, g: 180, b: 100 },
    { position: 1.0, r: 200, g: 220, b: 160 },
  ]),

  // === Vibrant Palettes ===
  createGradientPalette('rainbow', 'Rainbow', [
    { position: 0.0, r: 255, g: 0, b: 0 },
    { position: 0.17, r: 255, g: 127, b: 0 },
    { position: 0.33, r: 255, g: 255, b: 0 },
    { position: 0.5, r: 0, g: 255, b: 0 },
    { position: 0.67, r: 0, g: 127, b: 255 },
    { position: 0.83, r: 75, g: 0, b: 130 },
    { position: 1.0, r: 148, g: 0, b: 211 },
  ]),
  createGradientPalette('neon', 'Neon', [
    { position: 0.0, r: 255, g: 0, b: 255 },
    { position: 0.25, r: 0, g: 255, b: 255 },
    { position: 0.5, r: 0, g: 255, b: 0 },
    { position: 0.75, r: 255, g: 255, b: 0 },
    { position: 1.0, r: 255, g: 0, b: 255 },
  ]),
  createGradientPalette('spectrum', 'Spectrum', [
    { position: 0.0, r: 200, g: 0, b: 0 },
    { position: 0.15, r: 255, g: 80, b: 0 },
    { position: 0.3, r: 255, g: 200, b: 0 },
    { position: 0.45, r: 0, g: 200, b: 0 },
    { position: 0.6, r: 0, g: 180, b: 200 },
    { position: 0.75, r: 0, g: 80, b: 255 },
    { position: 0.9, r: 120, g: 0, b: 200 },
    { position: 1.0, r: 200, g: 0, b: 0 },
  ]),
  createGradientPalette('electric', 'Electric', [
    { position: 0.0, r: 0, g: 0, b: 60 },
    { position: 0.2, r: 100, g: 0, b: 200 },
    { position: 0.4, r: 150, g: 50, b: 255 },
    { position: 0.6, r: 200, g: 150, b: 255 },
    { position: 0.8, r: 220, g: 200, b: 255 },
    { position: 1.0, r: 255, g: 255, b: 255 },
  ]),
  createGradientPalette('vivid', 'Vivid', [
    { position: 0.0, r: 180, g: 0, b: 50 },
    { position: 0.2, r: 255, g: 50, b: 100 },
    { position: 0.4, r: 255, g: 150, b: 50 },
    { position: 0.6, r: 100, g: 200, b: 50 },
    { position: 0.8, r: 50, g: 150, b: 200 },
    { position: 1.0, r: 100, g: 50, b: 200 },
  ]),

  // === Pastel Palettes ===
  createGradientPalette('pastel-rainbow', 'Pastel Rainbow', [
    { position: 0.0, r: 255, g: 180, b: 180 },
    { position: 0.17, r: 255, g: 220, b: 180 },
    { position: 0.33, r: 200, g: 255, b: 180 },
    { position: 0.5, r: 180, g: 255, b: 200 },
    { position: 0.67, r: 180, g: 220, b: 255 },
    { position: 0.83, r: 220, g: 200, b: 255 },
    { position: 1.0, r: 255, g: 180, b: 220 },
  ]),
  createGradientPalette('pastel-green', 'Pastel Green', [
    { position: 0.0, r: 180, g: 220, b: 200 },
    { position: 0.25, r: 200, g: 235, b: 220 },
    { position: 0.5, r: 220, g: 245, b: 235 },
    { position: 0.75, r: 240, g: 250, b: 245 },
    { position: 1.0, r: 255, g: 255, b: 255 },
  ]),
  createGradientPalette('pastel-pink', 'Pastel Pink', [
    { position: 0.0, r: 255, g: 200, b: 220 },
    { position: 0.25, r: 255, g: 210, b: 230 },
    { position: 0.5, r: 255, g: 225, b: 240 },
    { position: 0.75, r: 255, g: 235, b: 245 },
    { position: 1.0, r: 255, g: 245, b: 250 },
  ]),
  createGradientPalette('lavender', 'Lavender', [
    { position: 0.0, r: 200, g: 180, b: 220 },
    { position: 0.3, r: 210, g: 195, b: 230 },
    { position: 0.5, r: 220, g: 210, b: 240 },
    { position: 0.7, r: 230, g: 225, b: 245 },
    { position: 1.0, r: 240, g: 235, b: 250 },
  ]),
  createGradientPalette('mint', 'Mint', [
    { position: 0.0, r: 180, g: 230, b: 210 },
    { position: 0.3, r: 195, g: 235, b: 220 },
    { position: 0.5, r: 210, g: 240, b: 230 },
    { position: 0.7, r: 225, g: 245, b: 240 },
    { position: 1.0, r: 240, g: 250, b: 250 },
  ]),
  createGradientPalette('peach', 'Peach', [
    { position: 0.0, r: 255, g: 210, b: 190 },
    { position: 0.25, r: 255, g: 220, b: 205 },
    { position: 0.5, r: 255, g: 230, b: 215 },
    { position: 0.75, r: 255, g: 235, b: 225 },
    { position: 1.0, r: 255, g: 245, b: 240 },
  ]),

  // === Monochrome Palettes ===
  createGradientPalette('monochrome-blue', 'Monochrome Blue', [
    { position: 0.0, r: 0, g: 10, b: 40 },
    { position: 0.25, r: 30, g: 50, b: 100 },
    { position: 0.5, r: 80, g: 120, b: 180 },
    { position: 0.75, r: 130, g: 170, b: 220 },
    { position: 1.0, r: 180, g: 210, b: 250 },
  ]),
  createGradientPalette('monochrome-purple', 'Monochrome Purple', [
    { position: 0.0, r: 20, g: 0, b: 30 },
    { position: 0.25, r: 60, g: 20, b: 80 },
    { position: 0.5, r: 120, g: 60, b: 140 },
    { position: 0.75, r: 180, g: 130, b: 200 },
    { position: 1.0, r: 220, g: 190, b: 240 },
  ]),
  createGradientPalette('monochrome-teal', 'Monochrome Teal', [
    { position: 0.0, r: 0, g: 20, b: 30 },
    { position: 0.25, r: 20, g: 70, b: 90 },
    { position: 0.5, r: 60, g: 130, b: 150 },
    { position: 0.75, r: 120, g: 190, b: 200 },
    { position: 1.0, r: 180, g: 230, b: 240 },
  ]),
  createGradientPalette('monochrome-red', 'Monochrome Red', [
    { position: 0.0, r: 30, g: 0, b: 0 },
    { position: 0.25, r: 100, g: 20, b: 20 },
    { position: 0.5, r: 180, g: 60, b: 60 },
    { position: 0.75, r: 230, g: 130, b: 130 },
    { position: 1.0, r: 255, g: 200, b: 200 },
  ]),
  createGradientPalette('monochrome-gold', 'Monochrome Gold', [
    { position: 0.0, r: 40, g: 30, b: 0 },
    { position: 0.25, r: 100, g: 80, b: 20 },
    { position: 0.5, r: 180, g: 150, b: 60 },
    { position: 0.75, r: 230, g: 200, b: 120 },
    { position: 1.0, r: 255, g: 240, b: 200 },
  ]),

  // === Special Effect Palettes ===
  createGradientPalette('plasma', 'Plasma', [
    { position: 0.0, r: 0, g: 0, b: 60 },
    { position: 0.15, r: 60, g: 0, b: 120 },
    { position: 0.3, r: 180, g: 0, b: 180 },
    { position: 0.5, r: 255, g: 60, b: 120 },
    { position: 0.7, r: 255, g: 150, b: 60 },
    { position: 0.85, r: 255, g: 220, b: 100 },
    { position: 1.0, r: 255, g: 255, b: 200 },
  ]),
  createGradientPalette('volcanic', 'Volcanic', [
    { position: 0.0, r: 0, g: 0, b: 0 },
    { position: 0.1, r: 40, g: 0, b: 0 },
    { position: 0.3, r: 120, g: 0, b: 0 },
    { position: 0.5, r: 200, g: 40, b: 0 },
    { position: 0.7, r: 255, g: 100, b: 0 },
    { position: 0.9, r: 255, g: 200, b: 100 },
    { position: 1.0, r: 255, g: 255, b: 200 },
  ]),
  createGradientPalette('alien', 'Alien', [
    { position: 0.0, r: 0, g: 40, b: 20 },
    { position: 0.2, r: 0, g: 100, b: 60 },
    { position: 0.4, r: 80, g: 180, b: 0 },
    { position: 0.6, r: 200, g: 255, b: 100 },
    { position: 0.8, r: 0, g: 255, b: 200 },
    { position: 1.0, r: 100, g: 200, b: 255 },
  ]),
  createGradientPalette('toxic', 'Toxic', [
    { position: 0.0, r: 20, g: 40, b: 0 },
    { position: 0.2, r: 60, g: 100, b: 20 },
    { position: 0.4, r: 120, g: 200, b: 0 },
    { position: 0.6, r: 180, g: 255, b: 50 },
    { position: 0.8, r: 220, g: 255, b: 150 },
    { position: 1.0, r: 255, g: 255, b: 200 },
  ]),
  createGradientPalette('inferno', 'Inferno', [
    { position: 0.0, r: 0, g: 0, b: 0 },
    { position: 0.2, r: 80, g: 0, b: 0 },
    { position: 0.4, r: 200, g: 0, b: 0 },
    { position: 0.6, r: 255, g: 100, b: 0 },
    { position: 0.8, r: 255, g: 200, b: 0 },
    { position: 1.0, r: 255, g: 255, b: 200 },
  ]),

  // === More Palette Varieties ===
  createGradientPalette('cherry', 'Cherry', [
    { position: 0.0, r: 80, g: 0, b: 40 },
    { position: 0.2, r: 150, g: 20, b: 60 },
    { position: 0.4, r: 200, g: 60, b: 100 },
    { position: 0.6, r: 230, g: 120, b: 150 },
    { position: 0.8, r: 255, g: 180, b: 200 },
    { position: 1.0, r: 255, g: 220, b: 240 },
  ]),
  createGradientPalette('golden', 'Golden', [
    { position: 0.0, r: 60, g: 40, b: 0 },
    { position: 0.2, r: 140, g: 100, b: 20 },
    { position: 0.4, r: 200, g: 160, b: 40 },
    { position: 0.6, r: 240, g: 200, b: 80 },
    { position: 0.8, r: 255, g: 220, b: 120 },
    { position: 1.0, r: 255, g: 245, b: 200 },
  ]),
  createGradientPalette('cosmic', 'Cosmic', [
    { position: 0.0, r: 10, g: 0, b: 30 },
    { position: 0.2, r: 60, g: 20, b: 100 },
    { position: 0.4, r: 120, g: 60, b: 180 },
    { position: 0.6, r: 180, g: 120, b: 220 },
    { position: 0.8, r: 200, g: 180, b: 255 },
    { position: 1.0, r: 255, g: 255, b: 255 },
  ]),
  createGradientPalette('aurora', 'Aurora', [
    { position: 0.0, r: 0, g: 80, b: 60 },
    { position: 0.2, r: 60, g: 160, b: 120 },
    { position: 0.4, r: 100, g: 220, b: 180 },
    { position: 0.6, r: 120, g: 255, b: 200 },
    { position: 0.8, r: 180, g: 255, b: 230 },
    { position: 1.0, r: 220, g: 255, b: 255 },
  ]),
  createGradientPalette('tropical', 'Tropical', [
    { position: 0.0, r: 0, g: 100, b: 150 },
    { position: 0.25, r: 0, g: 180, b: 200 },
    { position: 0.5, r: 100, g: 255, b: 200 },
    { position: 0.75, r: 255, g: 220, b: 100 },
    { position: 1.0, r: 255, g: 180, b: 100 },
  ]),
  createGradientPalette('desert', 'Desert', [
    { position: 0.0, r: 60, g: 40, b: 20 },
    { position: 0.2, r: 120, g: 80, b: 40 },
    { position: 0.4, r: 180, g: 120, b: 60 },
    { position: 0.6, r: 220, g: 160, b: 100 },
    { position: 0.8, r: 255, g: 210, b: 160 },
    { position: 1.0, r: 255, g: 240, b: 220 },
  ]),
  createGradientPalette('nebula', 'Nebula', [
    { position: 0.0, r: 20, g: 0, b: 40 },
    { position: 0.15, r: 80, g: 20, b: 100 },
    { position: 0.35, r: 180, g: 80, b: 200 },
    { position: 0.55, r: 255, g: 150, b: 220 },
    { position: 0.75, r: 200, g: 100, b: 180 },
    { position: 0.9, r: 100, g: 60, b: 140 },
    { position: 1.0, r: 40, g: 20, b: 80 },
  ]),
  createGradientPalette('frost', 'Frost', [
    { position: 0.0, r: 20, g: 40, b: 60 },
    { position: 0.2, r: 80, g: 120, b: 160 },
    { position: 0.4, r: 140, g: 180, b: 220 },
    { position: 0.6, r: 180, g: 220, b: 255 },
    { position: 0.8, r: 220, g: 240, b: 255 },
    { position: 1.0, r: 255, g: 255, b: 255 },
  ]),
  createGradientPalette('crimson', 'Crimson', [
    { position: 0.0, r: 40, g: 0, b: 10 },
    { position: 0.2, r: 100, g: 0, b: 20 },
    { position: 0.4, r: 180, g: 20, b: 40 },
    { position: 0.6, r: 220, g: 60, b: 80 },
    { position: 0.8, r: 255, g: 120, b: 140 },
    { position: 1.0, r: 255, g: 200, b: 220 },
  ]),
  createGradientPalette('jade', 'Jade', [
    { position: 0.0, r: 0, g: 40, b: 30 },
    { position: 0.2, r: 20, g: 80, b: 60 },
    { position: 0.4, r: 40, g: 130, b: 100 },
    { position: 0.6, r: 80, g: 180, b: 140 },
    { position: 0.8, r: 140, g: 220, b: 180 },
    { position: 1.0, r: 200, g: 255, b: 220 },
  ]),
  createGradientPalette('amber', 'Amber', [
    { position: 0.0, r: 60, g: 20, b: 0 },
    { position: 0.2, r: 120, g: 60, b: 0 },
    { position: 0.4, r: 180, g: 100, b: 20 },
    { position: 0.6, r: 230, g: 150, b: 60 },
    { position: 0.8, r: 255, g: 200, b: 100 },
    { position: 1.0, r: 255, g: 240, b: 180 },
  ]),
  createGradientPalette('slate', 'Slate', [
    { position: 0.0, r: 30, g: 30, b: 40 },
    { position: 0.2, r: 60, g: 70, b: 90 },
    { position: 0.4, r: 100, g: 110, b: 130 },
    { position: 0.6, r: 140, g: 150, b: 170 },
    { position: 0.8, r: 180, g: 190, b: 210 },
    { position: 1.0, r: 220, g: 225, b: 240 },
  ]),
]

/** All palettes: builtin + custom (loaded dynamically) */
export function getAllPalettes(customPalettes: Palette[] = []): Palette[] {
  return [...defaultPalettes, ...customPalettes]
}

/** Convert a Palette to a gradient CSS string for preview */
export function paletteToGradientCSS(palette: Palette): string {
  const sorted = [...palette.entries].sort((a, b) => a.position - b.position)
  if (sorted.length === 0) return oklabToRgbForCss(0, 0, 0.6)

  const stops = sorted.map(
    (entry) =>
      `${oklabToRgbForCss(entry.a, entry.b, 0.7)} ${Math.round(entry.position * 100)}%`,
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
}
