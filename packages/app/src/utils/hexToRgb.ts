import { vec3f } from 'typegpu/data'
import type { v3f } from 'typegpu/data'

const { round } = Math

export function hexToRgbNorm(hex: string): v3f {
  const cleaned = hex.replaceAll('#', '')
  // Expand shorthand `#rgb` to `#rrggbb` — otherwise e.g. "f00" parses as the
  // 6-digit value 0x000f00 (a shade of green) instead of red.
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned
  const bigint = parseInt(expanded, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return vec3f(r / 255, g / 255, b / 255)
}

export function rgbNormToHex(rgb: v3f) {
  const [r, g, b] = rgb
  const rHex = round(r * 255)
    .toString(16)
    .padStart(2, '0')
  const gHex = round(g * 255)
    .toString(16)
    .padStart(2, '0')
  const bHex = round(b * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${rHex}${gHex}${bHex}`
}
