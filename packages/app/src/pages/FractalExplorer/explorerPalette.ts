/**
 * Palettes for the explorer: which one a location names, and the table the
 * colour pass reads.
 *
 * The table is a fixed-size cyclic run of OkLab (a, b) pairs. The app's
 * palettes are ramps, not loops, so the table runs the ramp forward and then
 * back; the colour never jumps where the iteration count wraps around the
 * cycle.
 */
import { loadCustomPalettes, paletteToColorMap } from '@/flame/colorMap'
import { defaultPalettes } from '@/flame/palettes'
import type { Palette } from '@/flame/colorMap'

export const DEFAULT_PALETTE_ID = 'plasma'

/**
 * The palette for a location's id. The one just picked wins when the ids
 * match, so every palette the picker offers applies at once. Otherwise the
 * id is looked up among the built-in palettes and the custom ones saved in
 * this browser, and an unknown id gets the default. flam3 palettes get a new
 * id each time they load, so a link cannot bring one back.
 *
 * A custom palette is parsed from storage on every call, so each call returns
 * a new object for it. Look one up when the id changes, not on every change
 * of the location that carries it.
 */
export function resolvePalette(
  id: string | undefined,
  picked: Palette | undefined,
): Palette {
  if (picked !== undefined && picked.id === id) return picked
  const named =
    id === undefined
      ? undefined
      : [...defaultPalettes, ...loadCustomPalettes()].find((p) => p.id === id)
  return (
    named ??
    defaultPalettes.find((p) => p.id === DEFAULT_PALETTE_ID) ??
    defaultPalettes[0]!
  )
}

export function paletteLut(
  palette: Palette,
  size: number,
): Float32Array<ArrayBuffer> {
  const half = size / 2
  const ramp = paletteToColorMap(palette, half + 1)
  const lut = new Float32Array(size * 2)
  for (let i = 0; i < size; i += 1) {
    const entry = ramp[i <= half ? i : size - i] ?? ramp[0]!
    lut[2 * i] = entry.a
    lut[2 * i + 1] = entry.b
  }
  return lut
}
