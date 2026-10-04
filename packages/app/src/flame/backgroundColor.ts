/**
 * The colour a flame's canvas is cleared to, the ground its art sits on: the
 * flame's own background colour when it names one, otherwise black for light
 * drawing and white for paint. Flam3 clears to it.
 */
import { backgroundColorDefault, backgroundColorDefaultWhite, } from './schema/flameSchema'
import type { FlameDescriptor } from './schema/flameSchema'

export type Rgb = readonly [number, number, number]

export function flameBackgroundColor(
  renderSettings: FlameDescriptor['renderSettings'],
): Rgb {
  const chosen = renderSettings.backgroundColor
  // A colour the user chose is respected as it is, with no swap for paint.
  if (chosen !== undefined) return chosen
  return renderSettings.drawMode !== 'light'
    ? backgroundColorDefaultWhite
    : backgroundColorDefault
}
